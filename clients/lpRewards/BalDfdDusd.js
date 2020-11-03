const Web3Client = require('../Web3Client')
const utils = require('../utils')
const web3 = require('web3')

const DFDRewards = require('../../artifacts/DFDRewards.json')
const IERC20 = require('../../artifacts/ERC20Detailed.json')

const toBN = web3.utils.toBN

class BalDfdDusd {
    constructor(web3, config) {
        web3 = web3 || new Web3()
        this.web3 = web3
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
        this.bpt = new this.web3.eth.Contract(IERC20.abi, _bpool)
    }

    stake(amount, options = {}) {
        // gas estimate for stake is inaccurate for some reason
        if (!options.gas) {
            options.gas = 200000
        }
        return this.web3Client.send(
            this.rewards.methods.stake(utils.scale(amount, 18).toString()),
            options
        )
    }

    withdraw(amount, options = {}) {
        // gas estimate for withdraw is inaccurate for some reason
        if (!options.gas) {
            options.gas = 200000
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

    async getAccountInfo(account) {
        const [ staked, withdrawAble, earned, balanceOf ] = await Promise.all([
            this.rewards.methods.balanceOf(account).call(),
            this.rewards.methods.withdrawAble(account).call(),
            this.rewards.methods.earned(account).call(),
            this.balanceOf(account)
        ])
        return { staked, withdrawAble, earned, balanceOf }
    }

    // Bal pool info methods

    totalSupply() {
        return this.bpt.methods.totalSupply().call()
    }

    staked() {
        return this.balanceOf(this.rewards.options.address)
    }

    poolAddress() {
        return this.bpt.options.address
    }

    async composition(account) {
        const _dfd = new this.web3.eth.Contract(IERC20.abi, this.config.contracts.tokens.DFD.address)
        const _dusd = new this.web3.eth.Contract(IERC20.abi, this.config.contracts.tokens.DUSD.address)
        let [ totalSupply, dfd, dusd, balanceOf ] = await Promise.all([
            this.totalSupply(),
            _dfd.methods.balanceOf(this.bpt.options.address).call(),
            _dusd.methods.balanceOf(this.bpt.options.address).call(),
            this.rewards.methods.balanceOf(account).call(),
        ])
        totalSupply = toBN(totalSupply)
        const poolShare = toBN(balanceOf).mul(toBN(1e6)).div(totalSupply)
        const a = {
            share: poolShare.div(toBN(1e4)).toString(), // 100x % multiplier
            dfd: toBN(dfd).mul(poolShare).div(toBN(1e6)).toString(),
            dusd: toBN(dusd).mul(poolShare).div(toBN(1e6)).toString()
        }
        console.log(a)
        return a
    }

    // Helper methods

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
    approve(amount, options = {}, trust = false) {
        const txObject = this.bpt.methods.approve(
            this.rewards.options.address,
            trust ? amount : utils.scale(amount, 18).toString()
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
