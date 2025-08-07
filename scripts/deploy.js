const hre = require("hardhat");
const { ethers } = hre;
require("dotenv").config();

async function main() {
    let owner, contract, oracle, loanToken, collateralToken;

    if (hre.network.name === "hardhat") {
        [owner] = await ethers.getSigners();
        console.log("Deploying to hardhat with local signer:", owner.address);
        console.log("\n\n");

        const Morpho = await ethers.getContractFactory("Morpho", owner);
        const Oracle = await ethers.getContractFactory("OracleMock", owner);
        const LoanToken = await ethers.getContractFactory("ERC20Mock", owner);
        const CollateralToken = await ethers.getContractFactory("ERC20Mock", owner);
        const oraclePrice = ethers.parseUnits("100", 36);

        contract = await Morpho.deploy(owner.address);
        oracle = await Oracle.deploy(oraclePrice, 18, 18);
        loanToken = await LoanToken.deploy("LoanToken", "EURCV", 18);
        collateralToken = await CollateralToken.deploy("CollateralToken", "DNCB", 18);

        // ✅ Attente du déploiement
        await contract.waitForDeployment();
        await oracle.waitForDeployment();
        await loanToken.waitForDeployment();
        await collateralToken.waitForDeployment();

    } else if (hre.network.name === "sepoliaScroll") {
        [owner] = await ethers.getSigners();

        console.log("Deploying to sepoliaScroll with owner:", owner.address);
        console.log("\n\n");
        const Morpho = await ethers.getContractFactory("Morpho", owner);
        const Oracle = await ethers.getContractFactory("OracleMock", owner);
        const LoanToken = await ethers.getContractFactory("ERC20Mock", owner);
        const CollateralToken = await ethers.getContractFactory("ERC20Mock", owner);

        const oraclePrice = ethers.parseUnits("100", 36);
        contract = await Morpho.deploy(owner.address);
        oracle = await Oracle.deploy(oraclePrice, 18, 18);
        loanToken = await LoanToken.deploy("LoanToken", "EURCV", 18);
        collateralToken = await CollateralToken.deploy("CollateralToken", "DNCB", 18);

        await contract.waitForDeployment();
        await oracle.waitForDeployment();
        await loanToken.waitForDeployment();
        await collateralToken.waitForDeployment();

    } else {
        throw new Error(`Unsupported network: ${hre.network.name}`);
    }

    // ✅ Récupération de l'adresse en ethers v6
    const deployedAddress = await contract.getAddress();
    const oracleAddress = await oracle.getAddress();
    const loanTokenAddress = await loanToken.getAddress();
    const collateralTokenAddress = await collateralToken.getAddress();
    console.log("Contract deployed to:", deployedAddress);
    console.log("Oracle deployed to:", oracleAddress);
    console.log("LoanToken deployed to:", loanTokenAddress);
    console.log("CollateralToken deployed to:", collateralTokenAddress);

    // ✅ Récupération de la transaction en ethers v6
    const tx = contract.deploymentTransaction();
    const oracleTx = oracle.deploymentTransaction();
    const loanTokenTx = loanToken.deploymentTransaction();
    const collateralTokenTx = collateralToken.deploymentTransaction();

    const receipt = await tx.wait();
    const oracleReceipt = await oracleTx.wait();
    const loanTokenReceipt = await loanTokenTx.wait();
    const collateralTokenReceipt = await collateralTokenTx.wait();
    console.log("\n\n");
    console.log("Transaction hash:", receipt.hash);
    console.log("Oracle transaction hash:", oracleReceipt.hash);
    console.log("LoanToken transaction hash:", loanTokenReceipt.hash);
    console.log("CollateralToken transaction hash:", collateralTokenReceipt.hash);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
