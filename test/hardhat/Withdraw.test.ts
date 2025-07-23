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
    await morpho.connect(borrowers[0]).validateMarket(marketParams);

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

    await morpho.connect(suppliers[0]).supply(marketParams, 1000, 0, suppliers[0].address, "0x");
    await morpho.connect(borrowers[0]).supplyCollateral(marketParams, 1000, borrowers[0].address, "0x");
    });

    describe("Withdraw of assets", () => {
        it("should withdraw partial assets", async () => {
            await morpho.connect(suppliers[0]).withdraw(marketParams, 100, 0, suppliers[0].address, suppliers[0].address);
            let pos = await morpho.connect(suppliers[0]).position(id as BytesLike, suppliers[0].address)
            expect(pos.supplyShares).to.equal(900e6);
        });

        it("should withdraw all assets", async () => {
            await morpho.connect(suppliers[0]).withdraw(marketParams, 1000, 0, suppliers[0].address, suppliers[0].address);
            let pos = await morpho.connect(suppliers[0]).position(id as BytesLike, suppliers[0].address)
            expect(pos.supplyShares).to.equal(0);
        });

        it("should withdraw if market is expired", async () => {
            const block = await hre.ethers.provider.getBlock("latest");
            const elapsed = 1000 * 86400;

            await setNextBlockTimestamp(block!.timestamp + elapsed);
            
            await morpho.connect(suppliers[0]).withdraw(marketParams, 1000, 0, suppliers[0].address, suppliers[0].address);
            let pos = await morpho.connect(suppliers[0]).position(id as BytesLike, suppliers[0].address)
            expect(block!.timestamp + elapsed).to.be.greaterThan(marketParams.expiryDate);
            expect(pos.supplyShares).to.equal(0);
        });

        it("should not withdraw assets if not authorized", async () => {
            await expect(
                morpho.connect(suppliers[1]).withdraw(marketParams, 100, 0, suppliers[1].address, suppliers[1].address)
            ).to.be.revertedWith("not authorized");
        });

        it("should not withdraw assets if not enough liquidity", async () => {
            await morpho.connect(borrowers[0]).borrow(marketParams, 860, 0, borrowers[0].address, borrowers[0].address);
            await expect(
                morpho.connect(suppliers[0]).withdraw(marketParams, 1000, 0, suppliers[0].address, suppliers[0].address)
            ).to.be.revertedWith("insufficient liquidity");
        });
    });

    describe("Withdraw of collateral", () => {
        it("should withdraw partial collateral", async () => {
            await morpho.connect(borrowers[0]).withdrawCollateral(marketParams, 100, borrowers[0].address, borrowers[0].address);
            let pos = await morpho.connect(borrowers[0]).position(id as BytesLike, borrowers[0].address)
            expect(pos.collateral).to.equal(900);
        });

        it("should withdraw all collateral", async () => {
            await morpho.connect(borrowers[0]).withdrawCollateral(marketParams, 1000, borrowers[0].address, borrowers[0].address);
            let pos = await morpho.connect(borrowers[0]).position(id as BytesLike, borrowers[0].address)
            expect(pos.collateral).to.equal(0);
        });

        it("should withdraw collateral if market is expired", async () => {
            const block = await hre.ethers.provider.getBlock("latest");
            const elapsed = 1000 * 86400;

            await setNextBlockTimestamp(block!.timestamp + elapsed);
            await morpho.connect(borrowers[0]).withdrawCollateral(marketParams, 1000, borrowers[0].address, borrowers[0].address);
            let pos = await morpho.connect(borrowers[0]).position(id as BytesLike, borrowers[0].address)
            expect(block!.timestamp + elapsed).to.be.greaterThan(marketParams.expiryDate);
            expect(pos.collateral).to.equal(0);
        });

        it("should not withdraw collateral if not authorized", async () => {
            await expect(
                morpho.connect(borrowers[1]).withdrawCollateral(marketParams, 100, borrowers[1].address, borrowers[1].address)
            ).to.be.revertedWith("not authorized");
        });

        it("should not withdraw collateral if unhealhy position", async () => {
            await morpho.connect(borrowers[0]).borrow(marketParams, 860, 0, borrowers[0].address, borrowers[0].address);
            await expect(
                morpho.connect(borrowers[0]).withdrawCollateral(marketParams, 1000, borrowers[0].address, borrowers[0].address)
            ).to.be.revertedWith("insufficient collateral");
        });
    
    });
});