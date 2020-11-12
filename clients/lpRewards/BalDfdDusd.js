const Web3 = require('web3');

const SnxStyleRewards = require('./SnxStyleRewards')
const IERC20 = require('../../artifacts/ERC20Detailed.json')

const toBN = Web3.utils.toBN
const toWei = Web3.utils.toWei
const fromWei = Web3.utils.fromWei

class BalDfdDusd extends SnxStyleRewards {
    constructor(web3, config) {
        super(
            web3,
            config,
            config.lpRewards.balDfdDusd.rewardsContract,
            config.lpRewards.balDfdDusd.lpToken
        )
    }

    async getAccountInfo(account) {
        const res = await super.getAccountInfo(account)
        res.withdrawAble = await this.rewards.methods.withdrawAble(account).call()
        return res
    }

    async composition(account) {
        return this.share(await this.rewards.methods.balanceOf(account).call())
    }

    async share(balanceOf) {
        const _dfd = new this.web3.eth.Contract(IERC20.abi, this.config.contracts.tokens.DFD.address)
        const _dusd = new this.web3.eth.Contract(IERC20.abi, this.config.contracts.tokens.DUSD.address)
        let [ totalSupply, dfd, dusd ] = await Promise.all([
            this.totalSupply(),
            _dfd.methods.balanceOf(this.lpToken.options.address).call(),
            _dusd.methods.balanceOf(this.lpToken.options.address).call(),
        ])
        totalSupply = toBN(totalSupply)
        const poolShare = toBN(toWei(balanceOf)).div(totalSupply) // share * 1e18
        return {
            share: poolShare.div(toBN(10).pow(toBN(16))).toString(), // 100x % multiplier
            dfd: fromWei(toBN(dfd).mul(poolShare)),
            dusd: fromWei(toBN(dusd).mul(poolShare))
        }
    }
}

module.exports = BalDfdDusd
