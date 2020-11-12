const SnxStyleRewards = require('./SnxStyleRewards')

class UniDfdDusd extends SnxStyleRewards {
    constructor(web3, config) {
        super(
            web3,
            config,
            config.contracts.lpRewards.uniDfdDusd.rewardsContract,
            config.contracts.lpRewards.uniDfdDusd.lpToken
        )
    }
}

module.exports = UniDfdDusd
