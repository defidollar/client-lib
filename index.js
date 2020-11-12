module.exports = {
    DefiDollarClient: require('./clients/DefiDollarClient'),
    ILMOClient: require('./clients/ILMOClient'),
    LPRewards: {
        BalDfdDusdClient: require('./clients/lpRewards/BalDfdDusd'),
        VestingClient: require('./clients/lpRewards/Vesting'),
        UniDfdDusdClient: require('./clients/lpRewards/UniDfdDusd'),
        UniDfdEthClient: require('./clients/lpRewards/UniDfdEth')
    }
}
