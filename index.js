module.exports = {
  DefiDollarClient: require("./clients/DefiDollarClient"),
  ILMOClient: require("./clients/ILMOClient"),
  SavingsClient: require("./clients/SavingsClient"),
  ibDFDClient: require("./clients/ibDFDClient"),
  LPRewards: {
    SnxStyleRewards: require("./clients/lpRewards/SnxStyleRewards"),
    BalDfdDusdClient: require("./clients/lpRewards/BalDfdDusd"),
    VestingClient: require("./clients/lpRewards/Vesting"),
    UniDfdDusdClient: require("./clients/lpRewards/UniDfdDusd"),
    UniDfdEthClient: require("./clients/lpRewards/UniDfdEth"),
  },
};
