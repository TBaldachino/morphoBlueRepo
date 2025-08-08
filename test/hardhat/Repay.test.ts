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
    ["address", "address", "address", "address", "address", "uint96", "uint128", "uint128", "uint128"],
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

    loanToken = await ERC20MockFactory.deploy("loanToken", "EURCV", 18);
    collateralToken = await ERC20MockFactory.deploy("collateralToke,", "DNCB", 18);

    const OracleMockFactory = await hre.ethers.getContractFactory("OracleMock", admin);
    const oraclePrice = ethers.parseUnits("1", 36)

    oracle = await OracleMockFactory.deploy(oraclePrice, 18, 18);

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
        expiryDate: BigInt(expiryDate),
        initialBorrowAmount: ethers.parseUnits("100", 18),
        initialCollateralAmount: ethers.parseUnits("1000", 18),
        repayAmount: ethers.parseUnits("100", 18),
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

    await morpho.connect(suppliers[0]).supply(marketParams, suppliers[0].address, "0x");
    await morpho.connect(borrowers[0]).supplyCollateral(marketParams, borrowers[0].address, "0x");
    await morpho.connect(borrowers[0]).borrow(marketParams, borrowers[0].address, borrowers[0].address);
    });

    describe("Repay of assets", () => {
        it("should repay partial assets", async () => {
            await morpho.connect(borrowers[0]).repay(marketParams, ethers.parseUnits("100", 18), 0, borrowers[0].address, "0x");
            let pos = await morpho.connect(borrowers[0]).position(id as BytesLike, borrowers[0].address)
            expect(pos.borrowShares).to.equal(ethers.parseUnits("900", 24));
        });

        it("should repay all assets", async () => {
            await morpho.connect(borrowers[0]).repay(marketParams, 0, ethers.parseUnits("1000", 24), borrowers[0].address, "0x");
            let pos = await morpho.connect(borrowers[0]).position(id as BytesLike, borrowers[0].address)
            expect(pos.borrowShares).to.equal(0);
        });

        it("should repay with interest and if market is expired", async () => {

            const block = await hre.ethers.provider.getBlock("latest");
            const elapsed = 1000 * 86400;

            await setNextBlockTimestamp(block!.timestamp + elapsed);

            await morpho.connect(borrowers[0]).repay(marketParams, ethers.parseUnits("1000", 18), 0, borrowers[0].address, "0x");
            let pos = await morpho.connect(borrowers[0]).position(id as BytesLike, borrowers[0].address)
            expect(block!.timestamp + elapsed).to.be.greaterThan(marketParams.expiryDate);
            expect(pos.borrowShares).to.be.greaterThan(0);
        });

        it("should not repay assets if not authorized", async () => {
            await expect(
                morpho.connect(borrowers[1]).repay(marketParams, ethers.parseUnits("100", 18), 0, borrowers[1].address, "0x")
            ).to.be.revertedWith("not authorized");
        });
    });
});