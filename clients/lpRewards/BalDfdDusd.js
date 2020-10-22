const Web3Client = require('../Web3Client')
const utils = require('../utils')

const DFDRewards = require('../../artifacts/DFDRewards.json')
const IERC20 = require('../../artifacts/ERC20Detailed.json')

class BalDfdDusd {
    constructor(web3, config) {
        web3 = web3 || new Web3()
        this.web3Client = new Web3Client(web3)
        this.config = config
        this.rewards = new web3.eth.Contract(DFDRewards.abi, config.contracts.genesis)
    }

    async isReady() {
        const { _bpool } = await this.rewards.methods.getStats().call()
        return _bpool == utils.ZEROAddress ? false : true
    }

    async initialize() {
        const { _bpool } = await this.rewards.methods.getStats().call()
        if (_bpool == utils.ZEROAddress) {
            throw new Error('Pool is not yet ready')
        }
        this.bpt = new web3.eth.Contract(IERC20.abi, _bpool)
    }

    stake(amount, options = {}) {
        if (!options.gas) {
            // gas estimate for withdraw is inaccurate for some reason
            options.gas = 2000000
        }
        return this.web3Client.send(
            this.rewards.methods.stake(utils.scale(amount, 18).toString()),
            options
        )
    }

    withdraw(amount, options = {}) {
        if (!options.gas) {
            // gas estimate for withdraw is inaccurate for some reason
            options.gas = 2000000
        }
        return this.web3Client.send(
            this.rewards.methods.withdraw(utils.scale(amount, 18).toString()),
            options
        )
    }

    getReward(options = {}) {
        return this.web3Client.send(this.rewards.methods.getReward(), options)
    }

    exit(options = {}) {
        return this.web3Client.send(this.rewards.methods.exit(), options)
    }

    earned(account) {
        return this.rewards.methods.earned(account).call()
    }

    withdrawAble(account) {
        return this.rewards.methods.withdrawAble(account).call()
    }

    // Balance of BPT that is staked in this LP contract
    balanceOf(account) {
        return this.bpt.methods.balanceOf(account).call()
    }

    allowance(account) {
        return this.bpt.methods.allowance(account, this.rewards.options.address).call()
    }

    /**
     * @notice approve
     * @param amount Amount without having accounted for decimals
     */
    approve(amount, options = {}) {
        const txObject = this.bpt.methods.approve(
            this.rewards.options.address,
            utils.scale(amount, 18).toString()
        )
        return this.web3Client.send(txObject, options)
    }

    // async getAPY(days) {
    //     const res = { allTime: 0 }
    //     days = parseInt(days)
    //     if (days) res[days] = 0
    //     const events = await this.rewards.getPastEvents('RewardPerTokenUpdated', { fromBlock: 0 })
    //     // event RewardPerTokenUpdated(uint indexed rewardPerToken, uint indexed when);
    //     // first event is first stake event when rewardPerTokenStored was definitely 0
    //     if (!events.length) return res

    //     const year = toBN('3153600000') // 24*60*60*365*100% = 3,15,36,00,000
    //     const rewardPerToken = toBN(await this.rewards.methods.updateProtocolIncome().call())

    //     // all time
    //     let from = toBN(events[0].raw.topics[2].slice(2), 'hex') // first ever event
    //     let to = toBN(parseInt(Date.now() / 1000))
    //     if (to.lte(from)) { // same block
    //         to = from.add(toBN(1))
    //     }
    //     // console.log({ rewardPerToken, year, to: to.toString(), from: from.toString() })
    //     res.allTime = rewardPerToken.mul(year).div(SCALE_18).div(to.sub(from)).toString()

    //     if (!days) return res

    //     // last `days` days
    //     let past = parseInt(Date.now() / 1000) - 86400 * parseInt(days)
    //     let index = 0
    //     for (let i = events.length-1; i >=0; i--) {
    //         if (parseInt(toBN(events[i].raw.topics[2].slice(2), 'hex').toString()) <= past) {
    //             index = i
    //             break
    //         }
    //     }
    //     res[days] = rewardPerToken
    //         .sub(toBN(events[index].raw.topics[1].slice(2), 'hex'))
    //         .mul(year).div(SCALE_18)
    //         .div(to.sub(toBN(events[index].raw.topics[2].slice(2), 'hex')))
    //         .toString()
    //     return res
    // }
}

module.exports = BalDfdDusd
