const hre = require("hardhat");
require("dotenv").config();

/**
 * Utilitaire pour calculer l'ID d'un marché Morpho
 * L'ID est calculé en hashant les paramètres du marché
 */

function calculateMarketId(marketParams) {
  // Encode les paramètres du marché selon la structure MarketParams
  const encoded = hre.ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(address,address,address,uint256,address,address,uint128,uint128,bool,bool)"
    ],
    [[
      marketParams.loanToken,
      marketParams.collateralToken,
      marketParams.oracle,
      marketParams.lltv,
      marketParams.lender,
      marketParams.borrower,
      marketParams.irm,
      marketParams.expiryDate,
      marketParams.isValidatedByLender || false,
      marketParams.isValidatedByBorrower || false
    ]]
  );

  // Hash l'encodage pour obtenir l'ID
  return hre.ethers.utils.keccak256(encoded);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 8) {
    console.error("Usage: node scripts/market-id.js <loanToken> <collateralToken> <oracle> <lltv> <lender> <borrower> <irm> <expiryDate>");
    console.error("\nExemple:");
    console.error("node scripts/market-id.js \\");
    console.error("  0xA0b86a33E6441c4f7Bb51BfA6f4F82ADaC7F3bb8 \\  # USDC");
    console.error("  0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 \\  # WETH");
    console.error("  0x... \\                                         # Oracle");
    console.error("  800000000000000000 \\                           # LLTV (80%)");
    console.error("  0x... \\                                         # Lender");
    console.error("  0x... \\                                         # Borrower");
    console.error("  50000000000000000 \\                            # IRM (5% APY)");
    console.error("  1735689600                                      # Expiry (timestamp)");
    process.exit(1);
  }

  const SHORTCUTS = {
    lender1: process.env.LENDER1_PUBLIC_KEY,
    lender2: process.env.LENDER2_PUBLIC_KEY,
    borrower1: process.env.BORROWER1_PUBLIC_KEY,
    borrower2: process.env.BORROWER2_PUBLIC_KEY,
    user: process.env.USER_PUBLIC_KEY,
    owner: process.env.OWNER_PUBLIC_KEY,
    usdc: process.env.USDC_ADDRESS,
    usdt: process.env.USDT_ADDRESS,
    weth: process.env.WETH_ADDRESS,
    wbtc: process.env.WBTC_ADDRESS,
    usdcEthOracle: process.env.USDC_ETH_ORACLE,
    wbtcUsdOracle: process.env.WBTC_USD_ORACLE
  };

  // Traitement des arguments avec raccourcis
  const processedArgs = args.map(arg => {
    if (SHORTCUTS[arg]) {
      return SHORTCUTS[arg];
    }
    if (!isNaN(arg)) {
      return arg;
    }
    return arg;
  });

  const marketParams = {
    loanToken: processedArgs[0],
    collateralToken: processedArgs[1],
    oracle: processedArgs[2],
    lltv: processedArgs[3],
    lender: processedArgs[4],
    borrower: processedArgs[5],
    irm: processedArgs[6],
    expiryDate: processedArgs[7],
    isValidatedByLender: false,
    isValidatedByBorrower: false
  };

  try {
    const marketId = calculateMarketId(marketParams);
    
    console.log("📊 Calcul de l'ID du marché Morpho");
    console.log("================================");
    console.log("\nParamètres du marché:");
    console.log(`  Loan Token:       ${marketParams.loanToken}`);
    console.log(`  Collateral Token: ${marketParams.collateralToken}`);
    console.log(`  Oracle:           ${marketParams.oracle}`);
    console.log(`  LLTV:             ${marketParams.lltv} (${(marketParams.lltv / 1e18 * 100).toFixed(2)}%)`);
    console.log(`  Lender:           ${marketParams.lender}`);
    console.log(`  Borrower:         ${marketParams.borrower}`);
    console.log(`  IRM:              ${marketParams.irm}`);
    console.log(`  Expiry Date:      ${marketParams.expiryDate} (${new Date(marketParams.expiryDate * 1000).toISOString()})`);
    
    console.log(`\n🆔 Market ID: ${marketId}`);
    
    // Si on a accès au contrat, on peut vérifier si le marché existe
    const contractAddress = process.env.MORPHO_CONTRACT_ADDRESS;
    if (contractAddress) {
      try {
        const Morpho = await hre.ethers.getContractFactory("Morpho");
        const contract = Morpho.attach(contractAddress);
        
        const market = await contract.market(marketId);
        const exists = market.lastUpdate.gt(0);
        
        console.log(`\n📋 État du marché:`);
        console.log(`  Existe: ${exists ? '✅ Oui' : '❌ Non'}`);
        
        if (exists) {
          console.log(`  Dernière MAJ:      ${market.lastUpdate}`);
          console.log(`  Total Supply:      ${hre.ethers.utils.formatUnits(market.totalSupplyAssets, 18)} assets`);
          console.log(`  Total Borrow:      ${hre.ethers.utils.formatUnits(market.totalBorrowAssets, 18)} assets`);
          console.log(`  Frais:             ${market.fee} (${(market.fee / 1e18 * 100).toFixed(4)}%)`);
        }
      } catch (error) {
        console.log(`\n⚠️  Impossible de vérifier l'état du marché: ${error.message}`);
      }
    }

  } catch (error) {
    console.error("❌ Erreur lors du calcul:", error.message);
    process.exit(1);
  }
}

// Export de la fonction pour utilisation dans d'autres scripts
module.exports = { calculateMarketId };

// Exécution du script si appelé directement
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Erreur fatale:", error);
    process.exit(1);
  });
} 