# Morpho CLI

Script d'interface en ligne de commande pour interagir avec le contrat Morpho.

## Configuration

1. Copiez le fichier `scripts/env.example` vers `.env` à la racine du projet
2. Remplissez les variables d'environnement avec vos valeurs

```bash
cp scripts/env.example .env
```

Variables obligatoires :
- `MORPHO_CONTRACT_ADDRESS` : Adresse du contrat Morpho déployé

## Utilisation

```bash
node scripts/morpho-cli.js <functionName> [args...] [--from index|address] [--network <network>]
```

### Fonctions disponibles

#### Gestion du propriétaire
- `setOwner <newOwner>` - Change le propriétaire du contrat
- `setFeeRecipient <newFeeRecipient>` - Change le destinataire des frais

#### Gestion des marchés
- `createMarket <loanToken> <collateralToken> <oracle> <lltv> <lender> <borrower> <irm> <expiryDate>`
- `validateMarket <loanToken> <collateralToken> <oracle> <lltv> <lender> <borrower> <irm> <expiryDate>`
- `setFee <loanToken> <collateralToken> <oracle> <lltv> <lender> <borrower> <irm> <expiryDate> <newFee>`
- `accrueInterest <loanToken> <collateralToken> <oracle> <lltv> <lender> <borrower> <irm> <expiryDate>`

#### Gestion des prêts
- `supply <marketParams...> <assets> <shares> <onBehalf> [data]`
- `withdraw <marketParams...> <assets> <shares> <onBehalf> <receiver>`
- `borrow <marketParams...> <assets> <shares> <onBehalf> <receiver>`
- `repay <marketParams...> <assets> <shares> <onBehalf> [data]`

#### Gestion des collatéraux
- `supplyCollateral <marketParams...> <assets> <onBehalf> [data]`
- `withdrawCollateral <marketParams...> <assets> <onBehalf> <receiver>`

#### Liquidation
- `liquidate <marketParams...> <borrower> <seizedAssets> <repaidShares> [data]`

#### Flash loans
- `flashLoan <token> <assets> [data]`

#### Autorisations
- `setAuthorization <authorized> <newIsAuthorized>`

#### Fonctions de lecture
- `position <marketId> <user>`
- `market <marketId>`
- `idToMarketParams <marketId>`

### Raccourcis d'adresses

Le script supporte des raccourcis pour les adresses couramment utilisées :

**Acteurs :**
- `lender1`, `lender2` : Prêteurs
- `borrower1`, `borrower2` : Emprunteurs  
- `user` : Utilisateur générique
- `owner` : Propriétaire du contrat

**Tokens :**
- `usdc`, `usdt`, `weth`, `wbtc`

**Oracles :**
- `usdcEthOracle`, `wbtcUsdOracle`

### Options

- `--from <address|index>` : Spécifie le compte à utiliser pour la transaction
- `--network <network>` : Spécifie le réseau (défini dans hardhat.config.js)

## Exemples d'utilisation

### Créer un marché
```bash
# Marché USDC/WETH avec des adresses explicites
node scripts/morpho-cli.js createMarket \
  0xA0b86a33E6441c4f7Bb51BfA6f4F82ADaC7F3bb8 \
  0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 \
  0x... \
  800000000000000000 \
  0x... \
  0x... \
  50000000000000000 \
  1735689600

# Ou avec des raccourcis
node scripts/morpho-cli.js createMarket usdc weth usdcEthOracle 800000000000000000 lender1 borrower1 50000000000000000 1735689600 --from lender1
```

### Valider un marché
```bash
node scripts/morpho-cli.js validateMarket usdc weth usdcEthOracle 800000000000000000 lender1 borrower1 50000000000000000 1735689600 --from borrower1
```

### Fournir des liquidités
```bash
# Fournir 1000 USDC (avec 6 décimales)
node scripts/morpho-cli.js supply usdc weth usdcEthOracle 800000000000000000 lender1 borrower1 50000000000000000 1735689600 1000000000 0 lender1 0x --from lender1
```

### Fournir du collatéral
```bash
# Fournir 1 WETH (avec 18 décimales)
node scripts/morpho-cli.js supplyCollateral usdc weth usdcEthOracle 800000000000000000 lender1 borrower1 50000000000000000 1735689600 1000000000000000000 borrower1 0x --from borrower1
```

### Emprunter
```bash
# Emprunter 500 USDC
node scripts/morpho-cli.js borrow usdc weth usdcEthOracle 800000000000000000 lender1 borrower1 50000000000000000 1735689600 500000000 0 borrower1 borrower1 --from borrower1
```

### Lire les informations d'un marché
```bash
# Position d'un utilisateur
node scripts/morpho-cli.js position 0x... user

# État d'un marché  
node scripts/morpho-cli.js market 0x...

# Paramètres d'un marché
node scripts/morpho-cli.js idToMarketParams 0x...
```

## Structure MarketParams

Le `MarketParams` est une structure qui contient :
- `loanToken` : Adresse du token prêté
- `collateralToken` : Adresse du token utilisé comme collatéral
- `oracle` : Adresse de l'oracle de prix
- `lltv` : Loan-to-Value maximum (en WAD, 18 décimales)
- `lender` : Adresse du prêteur autorisé
- `borrower` : Adresse de l'emprunteur autorisé
- `irm` : Taux d'intérêt (en WAD par seconde)
- `expiryDate` : Date d'expiration du marché (timestamp Unix)
- `isValidatedByLender` : Validation par le prêteur
- `isValidatedByBorrower` : Validation par l'emprunteur

## Gestion des erreurs

Le script affiche des messages d'erreur détaillés en cas d'échec :
- Vérification des paramètres requis
- Messages d'erreur du contrat
- Statut des transactions

## Notes importantes

1. **Décimales** : Attention aux décimales des tokens (USDC = 6, WETH = 18, etc.)
2. **Autorisations** : Assurez-vous que les tokens sont approuvés avant les opérations
3. **Validation** : Les marchés doivent être validés par les deux parties avant utilisation
4. **Gas** : Les transactions peuvent nécessiter beaucoup de gas, ajustez en conséquence
5. **Sécurité** : Ne jamais exposer vos clés privées 