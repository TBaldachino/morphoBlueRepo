// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {IOracle} from "../interfaces/IOracle.sol";

/// @title MockOracle for Morpho-compatible systems
/// @notice Simple oracle for demo purposes, price can be manually set
/// @dev Returns a price scaled to 1e36 as required by Morpho's IOracle interface
contract OracleMock is IOracle {
    uint256 private _price; // Scaled price (1e36 format)
    uint8 public immutable loanTokenDecimals;
    uint8 public immutable collateralTokenDecimals;

    /// @param initialPrice The initial raw price of 1 collateral token quoted in 1 loan token (non-scaled)
    /// @param _loanTokenDecimals Decimals of the loan token (ex: 6 for USDC)
    /// @param _collateralTokenDecimals Decimals of the collateral token (ex: 18 for ETH)
    constructor(uint256 initialPrice, uint8 _loanTokenDecimals, uint8 _collateralTokenDecimals) {
        loanTokenDecimals = _loanTokenDecimals;
        collateralTokenDecimals = _collateralTokenDecimals;
        _setScaledPrice(initialPrice);
    }

    /// @inheritdoc IOracle
    function price() external view override returns (uint256) {
        return _price;
    }

    /// @notice Updates the price manually for demo purposes
    /// @param newPrice The new raw price of 1 collateral token quoted in 1 loan token (non-scaled)
    function setPrice(uint256 newPrice) external {
        _setScaledPrice(newPrice);
    }

    /// @dev Internal helper to scale the price according to Morpho’s rules
    function _setScaledPrice(uint256 rawPrice) internal {
        // Scale to 1e36 + loanDecimals - collateralDecimals
        uint256 scaleFactor = 36 + loanTokenDecimals - collateralTokenDecimals;
        _price = rawPrice * 10 ** scaleFactor;
    }
}
