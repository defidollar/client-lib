const Web3 = require('web3')

const Web3Client = require('../Web3Client')
const utils = require('../utils')

const DFDRewards = require('../../artifacts/DFDRewards.json')
const IERC20 = require('../../artifacts/ERC20Detailed.json')

class SnxStyleRewards {
    constructor(web3, config, rewardsContractAddress, lpTokenAddress) {
        web3 = web3 || new Web3()
        this.web3 = web3
        this.web3Client = new Web3Client(web3)
        this.config = config
        this.rewards = new web3.eth.Contract(DFDRewards.abi, rewardsContractAddress)
        this.lpToken = new web3.eth.Contract(IERC20.abi, lpTokenAddress)
    }

    stake(amount, options = {}) {
        return this.web3Client.hackySend(
            this.rewards.methods.stake(utils.scale(amount, 18).toString()),
            options
        )
    }

    withdraw(amount, options = {}) {
        return this.web3Client.hackySend(
            this.rewards.methods.withdraw(utils.scale(amount, 18).toString()),
            options
        )
    }

    getReward(options = {}) {
        return this.web3Client.hackySend(this.rewards.methods.getReward(), options)
    }

    exit(options = {}) {
        return this.web3Client.hackySend(this.rewards.methods.exit(), options, 650000)
    }

    async getAccountInfo(account, poolType) {
        const [ staked, dfdEarned, balanceOf ] = await Promise.all([
            this.rewards.methods.balanceOf(account).call(),
            this.rewards.methods.earned(account).call(),
            this.balanceOf(account)
        ])
        const res = { staked, dfdEarned, balanceOf }
        if (poolType === 'sushi') {
            res.otherEarned = await this.rewards.methods.sushiEarned(account).call()
        } else if (poolType === 'front') {
            res.otherEarned = await this.rewards.methods.frontEarned(account).call()
        }
        return res
    }

    /* #### Pool info methods #### */

    totalSupply() {
        return this.lpToken.methods.totalSupply().call()
    }

    staked() {
        return this.balanceOf(this.rewards.options.address)
    }

    poolAddress() {
        return this.lpToken.options.address
    }

    /* #### Helper methods #### */

    balanceOf(account) {
        return this.lpToken.methods.balanceOf(account).call()
    }

    allowance(account) {
        return this.lpToken.methods.allowance(account, this.rewards.options.address).call()
    }

    /**
     * @notice approve
     * @param amount Amount without having accounted for decimals
     */
    approve(amount, options = {}, trust = false) {
        const txObject = this.lpToken.methods.approve(
            this.rewards.options.address,
            trust ? amount : utils.scale(amount, 18).toString()
        )
        return this.web3Client.send(txObject, options)
    }
}

module.exports = SnxStyleRewards
