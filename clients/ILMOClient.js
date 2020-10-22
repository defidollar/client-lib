const Web3 = require('web3')

const Web3Client = require('./Web3Client')
const utils = require('./utils')

const DFDRewards = require('../artifacts/DFDRewards.json')
const IERC20 = require('../artifacts/ERC20Detailed.json')

const fromWei = Web3.utils.fromWei
const toWei = Web3.utils.toWei
const toBN = Web3.utils.toBN

const initialSupply = toBN('3000000')

class ILMOClient {
    constructor(web3, config) {
        web3 = web3 || new Web3()
        this.web3Client = new Web3Client(web3)
        this.config = config
        this.genesis = new web3.eth.Contract(DFDRewards.abi, config.contracts.genesis)
        this.dusd = new web3.eth.Contract(IERC20.abi, config.contracts.tokens.DUSD.address)
    }

    async getStats() {
        const { _totalContribution, _contributorCount, _initiateSequence, _liftOff, _bpool } = await this.genesis.methods.getStats().call()
        return {
            contribution: fromWei(_totalContribution),
            contributors: _contributorCount.toString(),
            mining: initialSupply.toString(),
            initiateSequence: _initiateSequence.toString(),
            liftOff: _liftOff.toString(),
            isInitialized: _bpool == utils.ZEROAddress ? false : true
        }
    }

    async getUserStats(account) {
        const [ { _totalContribution }, contribution ] = await Promise.all([
            this.genesis.methods.getStats().call(),
            this.genesis.methods.contributions(account).call()
        ])
        const mining = initialSupply.mul(toBN(contribution)).div(toBN(_totalContribution))
        const pct = parseFloat(mining.toString()) * 100 / parseFloat(initialSupply.toString())
        return { contribution: fromWei(contribution), mining: mining.toString(), pct: pct.toString() }
    }

    participate(amount, options = {}) {
        const txObject = this.genesis.methods.participate(toWei(amount.toString()))
        return this.web3Client.send(txObject, options)
    }

    balanceOf(account) {
        return this.dusd.methods.balanceOf(account).call()
    }

    allowance(account) {
        return this.dusd.methods.allowance(account, this.genesis.options.address).call()
    }

    /**
     * @notice approve
     * @param amount Amount without having accounted for decimals
     */
    approve(amount, options = {}) {
        const txObject = this.dusd.methods.approve(
            this.genesis.options.address,
            toWei(amount.toString())
        )
        return this.web3Client.send(txObject, options)
    }
}

module.exports = ILMOClient
