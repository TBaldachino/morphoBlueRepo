const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const args = process.argv.slice(2);
  const functionArgs = [];

  if (args.length < 1) {
    console.error("Usage: node scripts/morpho-cli.js <functionName> [args...] [--from index|address] [--network <network>]");
    console.error("\nFonctions disponibles:");
    console.error("  Gestion du propriétaire:");
    console.error("    setOwner <newOwner>");
    console.error("    setFeeRecipient <newFeeRecipient>");
    console.error("  Gestion des marchés:");
    console.error("    createMarket <loanToken> <collateralToken> <oracle> <lltv> <lender> <borrower> <irm> <expiryDate>");
    console.error("    validateMarket <loanToken> <collateralToken> <oracle> <lltv> <lender> <borrower> <irm> <expiryDate>");
    console.error("    setFee <loanToken> <collateralToken> <oracle> <lltv> <lender> <borrower> <irm> <expiryDate> <newFee>");
    console.error("    accrueInterest <loanToken> <collateralToken> <oracle> <lltv> <lender> <borrower> <irm> <expiryDate>");
    console.error("  Gestion des prêts:");
    console.error("    supply <marketParams...> <assets> <shares> <onBehalf> [data]");
    console.error("    withdraw <marketParams...> <assets> <shares> <onBehalf> <receiver>");
    console.error("    borrow <marketParams...> <assets> <shares> <onBehalf> <receiver>");
    console.error("    repay <marketParams...> <assets> <shares> <onBehalf> [data]");
    console.error("  Gestion des collatéraux:");
    console.error("    supplyCollateral <marketParams...> <assets> <onBehalf> [data]");
    console.error("    withdrawCollateral <marketParams...> <assets> <onBehalf> <receiver>");
    console.error("  Liquidation:");
    console.error("    liquidate <marketParams...> <borrower> <seizedAssets> <repaidShares> [data]");
    console.error("  Flash loan:");
    console.error("    flashLoan <token> <assets> [data]");
    console.error("  Autorisations:");
    console.error("    setAuthorization <authorized> <newIsAuthorized>");
    console.error("  Lecture:");
    console.error("    position <marketId> <user>");
    console.error("    market <marketId>");
    console.error("    idToMarketParams <marketId>");
    process.exit(1);
  }

  const contractAddress = process.env.MORPHO_CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error("⚠️  MORPHO_CONTRACT_ADDRESS non défini dans .env");
    process.exit(1);
  }

  const SHORTCUTS = {
    lender1: process.env.LENDER1_PUBLIC_KEY,
    lender2: process.env.LENDER2_PUBLIC_KEY,
    borrower1: process.env.BORROWER1_PUBLIC_KEY,
    borrower2: process.env.BORROWER2_PUBLIC_KEY,
    user: process.env.USER_PUBLIC_KEY,
    owner: process.env.OWNER_PUBLIC_KEY,
    // Tokens communs
    usdc: process.env.USDC_ADDRESS,
    usdt: process.env.USDT_ADDRESS,
    weth: process.env.WETH_ADDRESS,
    wbtc: process.env.WBTC_ADDRESS,
    // Oracles communs
    usdcEthOracle: process.env.USDC_ETH_ORACLE,
    wbtcUsdOracle: process.env.WBTC_USD_ORACLE
  };

  // Extraction du nom de fonction et des éventuels flags
  const functionName = args[0];

  let fromArg = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) {
      fromArg = args[i + 1];
      i++; // skip next argument
    } else if (args[i].startsWith("--")) {
      continue; // ignore other flags
    } else {
      let val = args[i];

      // Appliquer un raccourci si défini
      if (SHORTCUTS[val]) {
        val = SHORTCUTS[val];
      }

      if (/^0x[a-fA-F0-9]{40}$/.test(val)) {
        functionArgs.push(val); // address
      } else if (/^0x[a-fA-F0-9]{64}$/.test(val)) {
        functionArgs.push(val); // bytes32
      } else if (val === "true" || val === "false") {
        functionArgs.push(val === "true"); // boolean
      } else if (!isNaN(val)) {
        functionArgs.push(Number(val));
      } else if (val === "0x" || val === "") {
        functionArgs.push("0x"); // empty bytes
      } else {
        functionArgs.push(val); // default: string
      }
    }
  }

  const Morpho = await hre.ethers.getContractFactory("Morpho");
  const contract = Morpho.attach(contractAddress);

  // Récupération du signer
  const signers = await hre.ethers.getSigners();
  let signer = signers[0]; // défaut = 1er compte

  if (fromArg) {
    if (fromArg.startsWith("0x")) {
      const found = signers.find((s) => s.address.toLowerCase() === fromArg.toLowerCase());
      if (!found) {
        console.error(`Aucune adresse dans hre.ethers.getSigners() ne correspond à ${fromArg}`);
        process.exit(1);
      }
      signer = found;
    } else if (!isNaN(fromArg)) {
      const index = parseInt(fromArg);
      if (!signers[index]) {
        console.error(`Aucun signer à l'index ${index}`);
        process.exit(1);
      }
      signer = signers[index];
    }
  }

  const connectedContract = contract.connect(signer);

  try {
    // Traitement spécial pour les fonctions qui nécessitent MarketParams
    const marketParamsFunctions = [
      'createMarket', 'validateMarket', 'setFee', 'supply', 'withdraw', 
      'borrow', 'repay', 'supplyCollateral', 'withdrawCollateral', 
      'liquidate', 'accrueInterest'
    ];

    if (marketParamsFunctions.includes(functionName)) {
      const marketParams = buildMarketParams(functionName, functionArgs);
      const remainingArgs = getRemainingArgs(functionName, functionArgs);
      
      console.log("Appel avec le signer :", await signer.getAddress());
      console.log(`Appel de la fonction ${functionName}`);
      console.log("MarketParams:", marketParams);
      console.log("Arguments restants:", remainingArgs);
      
      const result = await connectedContract[functionName](marketParams, ...remainingArgs);

      if (result?.hash) {
        console.log("Transaction envoyée :", result.hash);
        await result.wait();
        console.log("Transaction minée ✅");
      } else {
        console.log("Résultat :", result);
      }
    } else {
      // Fonctions standard
      const fn = connectedContract[functionName];
      if (!fn) throw new Error(`Function "${functionName}" not found`);

      console.log("Appel avec le signer :", await signer.getAddress());
      console.log(`Appel de la fonction ${functionName} avec arguments :`, functionArgs);
      const result = await fn(...functionArgs);

      if (result?.hash) {
        console.log("Transaction envoyée :", result.hash);
        await result.wait();
        console.log("Transaction minée ✅");
      } else {
        console.log("Résultat :", result);
      }
    }
  } catch (err) {
    console.error("❌ Erreur lors de l'appel :", err.message);
    if (err.reason) console.error("Raison :", err.reason);
  }
}

function buildMarketParams(functionName, args) {
  // Structure MarketParams selon l'interface
  // address loanToken, address collateralToken, address oracle, uint256 lltv, 
  // address lender, address borrower, uint128 irm, uint128 expiryDate
  
  let marketParams;
  
  switch (functionName) {
    case 'createMarket':
    case 'validateMarket':
    case 'accrueInterest':
      // 8 paramètres pour MarketParams
      if (args.length < 8) {
        throw new Error(`${functionName} nécessite au moins 8 paramètres pour MarketParams`);
      }
      marketParams = {
        loanToken: args[0],
        collateralToken: args[1],
        oracle: args[2],
        lltv: args[3],
        lender: args[4],
        borrower: args[5],
        irm: args[6],
        expiryDate: args[7],
        isValidatedByLender: false,
        isValidatedByBorrower: false
      };
      break;
      
    case 'setFee':
      // 8 paramètres pour MarketParams + 1 pour newFee
      if (args.length < 9) {
        throw new Error("setFee nécessite 8 paramètres pour MarketParams + newFee");
      }
      marketParams = {
        loanToken: args[0],
        collateralToken: args[1],
        oracle: args[2],
        lltv: args[3],
        lender: args[4],
        borrower: args[5],
        irm: args[6],
        expiryDate: args[7],
        isValidatedByLender: false,
        isValidatedByBorrower: false
      };
      break;
      
    case 'supply':
    case 'withdraw':
    case 'borrow':
    case 'repay':
    case 'supplyCollateral':
    case 'withdrawCollateral':
    case 'liquidate':
      // 8 paramètres pour MarketParams + autres paramètres spécifiques à la fonction
      if (args.length < 8) {
        throw new Error(`${functionName} nécessite au moins 8 paramètres pour MarketParams`);
      }
      marketParams = {
        loanToken: args[0],
        collateralToken: args[1],
        oracle: args[2],
        lltv: args[3],
        lender: args[4],
        borrower: args[5],
        irm: args[6],
        expiryDate: args[7],
        isValidatedByLender: true, // Supposons validé pour les opérations
        isValidatedByBorrower: true
      };
      break;
      
    default:
      throw new Error(`Fonction ${functionName} non reconnue comme nécessitant MarketParams`);
  }
  
  return marketParams;
}

function getRemainingArgs(functionName, args) {
  // Retourne les arguments après les 8 premiers (MarketParams)
  const baseParamsCount = functionName === 'setFee' ? 8 : 8;
  
  switch (functionName) {
    case 'createMarket':
    case 'validateMarket':
    case 'accrueInterest':
      return []; // Pas d'arguments supplémentaires
      
    case 'setFee':
      return [args[8]]; // newFee
      
    case 'supply':
      // assets, shares, onBehalf, data
      return [
        args[8] || 0,  // assets
        args[9] || 0,  // shares
        args[10],      // onBehalf
        args[11] || "0x" // data
      ];
      
    case 'withdraw':
    case 'borrow':
      // assets, shares, onBehalf, receiver
      return [
        args[8] || 0,  // assets
        args[9] || 0,  // shares
        args[10],      // onBehalf
        args[11]       // receiver
      ];
      
    case 'repay':
      // assets, shares, onBehalf, data
      return [
        args[8] || 0,  // assets
        args[9] || 0,  // shares
        args[10],      // onBehalf
        args[11] || "0x" // data
      ];
      
    case 'supplyCollateral':
      // assets, onBehalf, data
      return [
        args[8],       // assets
        args[9],       // onBehalf
        args[10] || "0x" // data
      ];
      
    case 'withdrawCollateral':
      // assets, onBehalf, receiver
      return [
        args[8],  // assets
        args[9],  // onBehalf
        args[10]  // receiver
      ];
      
    case 'liquidate':
      // borrower, seizedAssets, repaidShares, data
      return [
        args[8],       // borrower
        args[9] || 0,  // seizedAssets
        args[10] || 0, // repaidShares
        args[11] || "0x" // data
      ];
      
    default:
      return args.slice(8);
  }
}

main().catch((error) => {
  console.error("❌ Erreur fatale:", error);
  process.exit(1);
}); 