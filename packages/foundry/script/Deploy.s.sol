//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import { DeployClawDerby } from "./DeployClawDerby.s.sol";

contract DeployScript is ScaffoldETHDeploy {
    function run() external {
        DeployClawDerby deployClawDerby = new DeployClawDerby();
        deployClawDerby.run();
    }
}
