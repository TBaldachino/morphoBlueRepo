const hre = require("hardhat");
const { calculateMarketId } = require("./market-id");
require("dotenv").config();

/**
 * Script de démonstration pour le protocole Morpho
 * Montre un workflow complet : création de marché, validation, supply, borrow, etc.
 */

async function main() {
  console.log("🚀 Démonstration du protocole Morpho");
  console.log("=====================================");

  // Vérification de la configuration
  const contractAddress = process.env.MORPHO_CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error("⚠️  MORPHO_CONTRACT_ADDRESS non défini dans .env");
    console.error("   Configurez votre fichier .env en vous basant sur scripts/env.example");
    process.exit(1);
  }

  try {
    // Connexion au contrat
    const Morpho = await hre.ethers.getContractFactory("Morpho");
    const contract = Morpho.attach(contractAddress);
    const signers = await hre.ethers.getSigners();

    console.log(`\n📄 Contrat Morpho: ${contractAddress}`);
    console.log(`🔑 Comptes disponibles: ${signers.length}`);

    // Exemple de paramètres de marché
    const marketParams = {
      loanToken: process.env.USDC_ADDRESS || "0xA0b86a33E6441c4f7Bb51BfA6f4F82ADaC7F3bb8", // USDC
      collateralToken: process.env.WETH_ADDRESS || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
      oracle: process.env.USDC_ETH_ORACLE || "0x1234567890123456789012345678901234567890", // Exemple
      lltv: "800000000000000000", // 80% LTV
      lender: signers[1].address, // Deuxième compte comme lender
      borrower: signers[2].address, // Troisième compte comme borrower
      irm: "50000000000000000", // 5% APY en WAD par seconde (approximation)
      expiryDate: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 an
      isValidatedByLender: false,
      isValidatedByBorrower: false
    };

    // Calcul de l'ID du marché
    const marketId = calculateMarketId(marketParams);
    console.log(`\n🆔 Market ID calculé: ${marketId}`);

    // Vérification de l'état actuel du marché
    console.log("\n📊 Vérification de l'état du marché...");
    try {
      const market = await contract.market(marketId);
      const marketExists = market.lastUpdate.gt(0);

      if (marketExists) {
        console.log("✅ Le marché existe déjà");
        console.log(`   Supply total: ${hre.ethers.utils.formatEther(market.totalSupplyAssets)} tokens`);
        console.log(`   Borrow total: ${hre.ethers.utils.formatEther(market.totalBorrowAssets)} tokens`);
        
        // Récupération des paramètres depuis le contrat
        const storedParams = await contract.idToMarketParams(marketId);
        console.log("   Paramètres stockés:");
        console.log(`     Lender: ${storedParams.lender}`);
        console.log(`     Borrower: ${storedParams.borrower}`);
        console.log(`     Validé par lender: ${storedParams.isValidatedByLender}`);
        console.log(`     Validé par borrower: ${storedParams.isValidatedByBorrower}`);
      } else {
        console.log("❌ Le marché n'existe pas encore");
      }
    } catch (error) {
      console.log(`⚠️  Erreur lors de la vérification: ${error.message}`);
    }

    // Informations sur les positions
    console.log("\n👥 Informations sur les positions:");
    for (let i = 0; i < Math.min(3, signers.length); i++) {
      try {
        const position = await contract.position(marketId, signers[i].address);
        console.log(`   ${signers[i].address}:`);
        console.log(`     Supply: ${hre.ethers.utils.formatEther(position.supplyShares)} shares`);
        console.log(`     Borrow: ${hre.ethers.utils.formatEther(position.borrowShares)} shares`);
        console.log(`     Collateral: ${hre.ethers.utils.formatEther(position.collateral)} tokens`);
      } catch (error) {
        console.log(`     Erreur: ${error.message}`);
      }
    }

    // Affichage des commandes suggérées
    console.log("\n🛠️  Commandes suggérées pour interagir avec ce marché:");
    console.log("================================");

    console.log("\n1️⃣  Créer le marché (si pas encore créé):");
    console.log(`node scripts/morpho-cli.js createMarket \\`);
    console.log(`  ${marketParams.loanToken} \\`);
    console.log(`  ${marketParams.collateralToken} \\`);
    console.log(`  ${marketParams.oracle} \\`);
    console.log(`  ${marketParams.lltv} \\`);
    console.log(`  ${marketParams.lender} \\`);
    console.log(`  ${marketParams.borrower} \\`);
    console.log(`  ${marketParams.irm} \\`);
    console.log(`  ${marketParams.expiryDate} \\`);
    console.log(`  --from 1`);

    console.log("\n2️⃣  Valider le marché (par le borrower):");
    console.log(`node scripts/morpho-cli.js validateMarket \\`);
    console.log(`  ${marketParams.loanToken} \\`);
    console.log(`  ${marketParams.collateralToken} \\`);
    console.log(`  ${marketParams.oracle} \\`);
    console.log(`  ${marketParams.lltv} \\`);
    console.log(`  ${marketParams.lender} \\`);
    console.log(`  ${marketParams.borrower} \\`);
    console.log(`  ${marketParams.irm} \\`);
    console.log(`  ${marketParams.expiryDate} \\`);
    console.log(`  --from 2`);

    console.log("\n3️⃣  Fournir des liquidités (1000 tokens avec 18 décimales):");
    console.log(`node scripts/morpho-cli.js supply \\`);
    console.log(`  ${marketParams.loanToken} \\`);
    console.log(`  ${marketParams.collateralToken} \\`);
    console.log(`  ${marketParams.oracle} \\`);
    console.log(`  ${marketParams.lltv} \\`);
    console.log(`  ${marketParams.lender} \\`);
    console.log(`  ${marketParams.borrower} \\`);
    console.log(`  ${marketParams.irm} \\`);
    console.log(`  ${marketParams.expiryDate} \\`);
    console.log(`  1000000000000000000000 \\  # 1000 tokens`);
    console.log(`  0 \\                        # shares (0 = calculé automatiquement)`);
    console.log(`  ${marketParams.lender} \\    # onBehalf`);
    console.log(`  0x \\                       # data (vide)`);
    console.log(`  --from 1`);

    console.log("\n4️⃣  Fournir du collatéral (1 ETH):");
    console.log(`node scripts/morpho-cli.js supplyCollateral \\`);
    console.log(`  ${marketParams.loanToken} \\`);
    console.log(`  ${marketParams.collateralToken} \\`);
    console.log(`  ${marketParams.oracle} \\`);
    console.log(`  ${marketParams.lltv} \\`);
    console.log(`  ${marketParams.lender} \\`);
    console.log(`  ${marketParams.borrower} \\`);
    console.log(`  ${marketParams.irm} \\`);
    console.log(`  ${marketParams.expiryDate} \\`);
    console.log(`  1000000000000000000 \\     # 1 ETH`);
    console.log(`  ${marketParams.borrower} \\  # onBehalf`);
    console.log(`  0x \\                       # data (vide)`);
    console.log(`  --from 2`);

    console.log("\n5️⃣  Emprunter (500 tokens):");
    console.log(`node scripts/morpho-cli.js borrow \\`);
    console.log(`  ${marketParams.loanToken} \\`);
    console.log(`  ${marketParams.collateralToken} \\`);
    console.log(`  ${marketParams.oracle} \\`);
    console.log(`  ${marketParams.lltv} \\`);
    console.log(`  ${marketParams.lender} \\`);
    console.log(`  ${marketParams.borrower} \\`);
    console.log(`  ${marketParams.irm} \\`);
    console.log(`  ${marketParams.expiryDate} \\`);
    console.log(`  500000000000000000000 \\   # 500 tokens`);
    console.log(`  0 \\                        # shares (0 = calculé automatiquement)`);
    console.log(`  ${marketParams.borrower} \\  # onBehalf`);
    console.log(`  ${marketParams.borrower} \\  # receiver`);
    console.log(`  --from 2`);

    console.log("\n6️⃣  Calculer l'ID du marché:");
    console.log(`node scripts/market-id.js \\`);
    console.log(`  ${marketParams.loanToken} \\`);
    console.log(`  ${marketParams.collateralToken} \\`);
    console.log(`  ${marketParams.oracle} \\`);
    console.log(`  ${marketParams.lltv} \\`);
    console.log(`  ${marketParams.lender} \\`);
    console.log(`  ${marketParams.borrower} \\`);
    console.log(`  ${marketParams.irm} \\`);
    console.log(`  ${marketParams.expiryDate}`);

    console.log("\n7️⃣  Vérifier une position:");
    console.log(`node scripts/morpho-cli.js position ${marketId} ${signers[1].address}`);

    console.log("\n💡 Notes importantes:");
    console.log("- Assurez-vous d'avoir configuré les bonnes adresses dans .env");
    console.log("- Les tokens doivent être approuvés avant les opérations");
    console.log("- Adaptez les montants selon les décimales des tokens");
    console.log("- Vérifiez que vous avez suffisamment de gas");

  } catch (error) {
    console.error("❌ Erreur lors de la démonstration:", error.message);
  }
}

main().catch((error) => {
  console.error("❌ Erreur fatale:", error);
  process.exit(1);
}); 