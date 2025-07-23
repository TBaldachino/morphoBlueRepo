import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
import { expect } from "chai";
import { AbiCoder, BytesLike, MaxUint256, ZeroAddress, ethers, keccak256, toBigInt } from "ethers";
import hre from "hardhat";
import { Morpho, OracleMock, ERC20Mock, IrmMock } from "types";
import { MarketParamsStruct } from "types/Morpho";
import { FlashBorrowerMock } from "types/mocks/FlashBorrowerMock";

const closePositions = false;
// Without the division it overflows.
const initBalance = MaxUint256 / 10000000000000000n;
const oraclePriceScale = 1000000000000000000000000000000000000n;

let seed = 42;
const random = () => {
  seed = (seed * 16807) % 2147483647;

  return (seed - 1) / 2147483646;
};

const identifier = (marketParams: MarketParamsStruct) => {
  const encodedMarket = AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "address", "address", "address", "uint64", "uint64", "uint128"],
    Object.values(marketParams),
  );

  return Buffer.from(keccak256(encodedMarket).slice(2), "hex");
};

const randomForwardTimestamp = async () => {
  const block = await hre.ethers.provider.getBlock("latest");
  const elapsed = (100 + Math.floor(random() * 100)) * 12; // 50% of the time, don't go forward in time.

  await setNextBlockTimestamp(block!.timestamp + elapsed);
};

describe("Morpho", () => {
  let admin: SignerWithAddress;
  let liquidator: SignerWithAddress;
  let suppliers: SignerWithAddress[];
  let borrowers: SignerWithAddress[];

  let morpho: Morpho;
  let loanToken: ERC20Mock;
  let collateralToken: ERC20Mock;
  let oracle: OracleMock;
  let flashBorrower: FlashBorrowerMock;

  let marketParams: MarketParamsStruct;
  let id: Buffer;

  const updateMarket = (newMarket: Partial<MarketParamsStruct>) => {
    marketParams = { ...marketParams, ...newMarket };
    id = identifier(marketParams);
  };

  beforeEach(async () => {
    const allSigners = await hre.ethers.getSigners();

    const users = allSigners.slice(0, -2);

    [admin, liquidator] = allSigners.slice(-2);
    suppliers = users.slice(0, users.length / 2);
    borrowers = users.slice(users.length / 2);

    const ERC20MockFactory = await hre.ethers.getContractFactory("ERC20Mock", admin);

    loanToken = await ERC20MockFactory.deploy();
    collateralToken = await ERC20MockFactory.deploy();

    const OracleMockFactory = await hre.ethers.getContractFactory("OracleMock", admin);

    oracle = await OracleMockFactory.deploy(1n, 0, 0);

    const MorphoFactory = await hre.ethers.getContractFactory("Morpho", admin);

    morpho = await MorphoFactory.deploy(admin.address);

    const irm = 5n * BigInt.WAD / 100n;

    /*updateMarket({
      loanToken: await loanToken.getAddress(),
      collateralToken: await collateralToken.getAddress(),
      oracle: await oracle.getAddress(),
      irm: irm,
      lltv: BigInt.WAD * 865n / 1000n,
    });

    await morpho.createMarket(marketParams);*/

    const morphoAddress = await morpho.getAddress();

    for (const user of users) {
      await loanToken.setBalance(user.address, initBalance);
      await loanToken.connect(user).approve(morphoAddress, MaxUint256);
      await collateralToken.setBalance(user.address, initBalance);
      await collateralToken.connect(user).approve(morphoAddress, MaxUint256);
    }

    await loanToken.setBalance(admin.address, initBalance);
    await loanToken.connect(admin).approve(morphoAddress, MaxUint256);

    await loanToken.setBalance(liquidator.address, initBalance);
    await loanToken.connect(liquidator).approve(morphoAddress, MaxUint256);
  });

  describe("Creation of a market", () => {
    it("should create a market", async () => {

        const irm = 5n * BigInt.WAD / 100n;

        const block = await hre.ethers.provider.getBlock("latest");
        const randomDelay = 86400 + Math.floor(Math.random() * 86400);
        const expiryDate = toBigInt(block!.timestamp + randomDelay);

        updateMarket({
            loanToken: await loanToken.getAddress(),
            collateralToken: await collateralToken.getAddress(),
            oracle: await oracle.getAddress(),
            lender: suppliers[0].address,
            borrower: borrowers[0].address,
            lltv: BigInt(BigInt.WAD * 865n / 1000n),
            irm: BigInt(irm),
            expiryDate: BigInt(expiryDate),
        });

        await morpho.connect(suppliers[0]).createMarket(marketParams);

        const market = await morpho.idToMarketParams(id as BytesLike);

        expect(market.lender).to.equal(suppliers[0].address);
        expect(market.borrower).to.equal(borrowers[0].address);
        expect(market.loanToken).to.equal(await loanToken.getAddress());
        expect(market.collateralToken).to.equal(await collateralToken.getAddress());
        expect(market.irm).to.equal(irm);
        expect(market.lltv).to.equal(BigInt.WAD * 865n / 1000n);
        expect(market.expiryDate).to.equal(expiryDate);
    });

    it("should not create a market if not authorized", async () => {

      updateMarket({
        lender: suppliers[0].address,
        borrower: borrowers[1].address,
      });

      await expect(
        morpho.connect(borrowers[0]).createMarket(marketParams)
      ).to.be.revertedWith("not authorized");
    });

    it("should not create a market if the market already exists", async () => {
      await morpho.connect(suppliers[0]).createMarket(marketParams);

      await expect(
        morpho.connect(suppliers[0]).createMarket(marketParams)
      ).to.be.revertedWith("market already created");
    });

    it("should not create a market if the market is already expired", async () => {
      updateMarket({
        expiryDate: 0n,
      });

      await expect(
        morpho.connect(suppliers[0]).createMarket(marketParams)
      ).to.be.revertedWith("market expired");
    });
  });

  describe("Validation of a market", () => {
    it("should validate a market", async () => {

      const block = await hre.ethers.provider.getBlock("latest");
      const randomDelay = 86400 + Math.floor(Math.random() * 86400);
      const expiryDate = toBigInt(block!.timestamp + randomDelay);

      updateMarket({
        loanToken: await loanToken.getAddress(),
        collateralToken: await collateralToken.getAddress(),
        oracle: await oracle.getAddress(),
        lender: suppliers[0].address,
        borrower: borrowers[0].address,
        lltv: BigInt(BigInt.WAD * 865n / 1000n),
        irm: BigInt(5n * BigInt.WAD / 100n),
        expiryDate: BigInt(expiryDate),
      });

      await morpho.connect(suppliers[0]).createMarket(marketParams);

      await morpho.connect(borrowers[0]).validateMarket(marketParams);
    });

    it("should not validate a market if not authorized", async () => {

      await morpho.connect(suppliers[0]).createMarket(marketParams);

      await expect(
        morpho.connect(borrowers[1]).validateMarket(marketParams)
      ).to.be.revertedWith("not authorized");
    });

    it("should not validate a market if the market is not created", async () => {
      await expect(
        morpho.connect(borrowers[0]).validateMarket(marketParams)
      ).to.be.revertedWith("market not created");
    });

    it("should not validate a market if the market is expired", async () => {

      await morpho.connect(suppliers[0]).createMarket(marketParams);

      const block = await hre.ethers.provider.getBlock("latest");
      const elapsed =  10000 * 86400;

      await setNextBlockTimestamp(block!.timestamp + elapsed);

      await expect(
        morpho.connect(borrowers[0]).validateMarket(marketParams)
      ).to.be.revertedWith("market expired");
    });

    it("should not validate a market if the market is already validated", async () => {

      const block = await hre.ethers.provider.getBlock("latest");
      const randomDelay = 86400 + Math.floor(Math.random() * 86400);
      const expiryDate = toBigInt(block!.timestamp + randomDelay);

      updateMarket({
        loanToken: await loanToken.getAddress(),
        collateralToken: await collateralToken.getAddress(),
        oracle: await oracle.getAddress(),
        lender: suppliers[0].address,
        borrower: borrowers[0].address,
        lltv: BigInt(BigInt.WAD * 865n / 1000n),
        irm: BigInt(5n * BigInt.WAD / 100n),
        expiryDate: BigInt(expiryDate),
      });

      await morpho.connect(suppliers[0]).createMarket(marketParams);

      await expect(
        morpho.connect(suppliers[0]).validateMarket(marketParams)
      ).to.be.revertedWith("market already validated");
    });
  });
});