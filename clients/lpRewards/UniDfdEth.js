const SnxStyleRewards = require('./SnxStyleRewards')

class UniDfdEth extends SnxStyleRewards {
    constructor(web3, config) {
        super(
            web3,
            config,
            config.contracts.lpRewards.uniDfdEth.rewardsContract,
            config.contracts.lpRewards.uniDfdEth.lpToken
        )
    }
}

module.exports = UniDfdEth
