# Morpho Repo - Custom Fork of Morpho Blue

This project is a customized fork of the [Morpho Blue](https://github.com/morpho-org/morpho-blue) protocol designed to implement bilateral repurchase agreements (repos) directly on-chain.

The goal is to closely replicate the mechanics of traditional repo markets using the efficiency and modularity of the Morpho Blue architecture. To achieve this, the protocol was extended to introduce new features and adapt the existing behavior.

## Key Modifications

- **Bilateral Markets**: Markets are no longer fully permissionless — each market is now defined by a specific `lender` and `borrower`, making interactions exclusive between two parties.
- **Maturity Date**: A `maturityDate` field was added to each market to support time-bound repo agreements.
- **Market Validation Flow**: A validation mechanism was implemented to allow the counterparty to explicitly accept the proposed market terms before the market becomes active.
- **Access Control**:
  - Lenders can only interact with certain functions: `supply`, `withdraw`.
  - Borrowers are restricted to: `supplyCollateral`, `withdrawCollateral`, `borrow`, and `repay`.
- **Extended Liquidation Logic**: A position becomes liquidable if:
  - Its Loan-to-Value ratio exceeds the LLTV threshold (`LTV >= LLTV`), **or**
  - The current block timestamp has passed the market's maturity date.

These additions make the protocol more suitable for institutional and testnet experiments where on-chain repo scenarios must mimic off-chain bilateral operations.

# Morpho Blue

Morpho Blue is a noncustodial lending protocol implemented for the Ethereum Virtual Machine.
Morpho Blue offers a new trustless primitive with increased efficiency and flexibility compared to existing lending platforms.
It provides permissionless risk management and permissionless market creation with oracle agnostic pricing.
It also enables higher collateralization factors, improved interest rates, and lower gas consumption.
The protocol is designed to be a simple, immutable, and governance-minimized base layer that allows for a wide variety of other layers to be built on top.
Morpho Blue also offers a convenient developer experience with a singleton implementation, callbacks, free flash loans, and account management features.

## Whitepaper

The protocol is described in detail in the [Morpho Blue Whitepaper](./morpho-blue-whitepaper.pdf).

## Repository Structure

[`Morpho.sol`](./src/Morpho.sol) contains most of the source code of the core contract of Morpho Blue.
It solely relies on internal libraries in the [`src/libraries`](./src/libraries) subdirectory.

Libraries in the [`src/libraries/periphery`](./src/libraries/periphery) directory are not used by Morpho Blue.
They are useful helpers that integrators can reuse or adapt to their own needs.

The [`src/mocks`](./src/mocks) directory contains contracts designed exclusively for testing.

You'll find relevant comments in [`IMorpho.sol`](./src/interfaces/IMorpho.sol), notably a list of requirements about market dependencies.

## Getting Started

Install dependencies: `yarn`

Run forge tests: `yarn test:forge`

Run hardhat tests: `yarn test:hardhat`

You will find other useful commands in the [`package.json`](./package.json) file.

## Audits

All audits are stored in the [audits](./audits/)' folder.

## Licences

The primary license for Morpho Blue is the Business Source License 1.1 (`BUSL-1.1`), see [`LICENSE`](./LICENSE).
However, all files in the following folders can also be licensed under `GPL-2.0-or-later` (as indicated in their SPDX headers): [`src/interfaces`](./src/interfaces), [`src/libraries`](./src/libraries), [`src/mocks`](./src/mocks), [`test`](./test), [`certora`](./certora).
