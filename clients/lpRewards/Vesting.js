const Web3 = require('web3');

const Web3Client = require('../Web3Client')
const utils = require('../utils')

const TokenVesting = require('../../artifacts/TokenVesting.json')

class Vesting {
    constructor(web3, config) {
        web3 = web3 || new Web3()
        this.web3Client = new Web3Client(web3)
        this.config = config
        this.vesting = new web3.eth.Contract(TokenVesting.abi, config.contracts.vesting)
    }

    async getAccountStats(account) {
        const [ claimable, info] = await Promise.all([
            this.claimable(account),
            this.vesting.methods.info(account).call()
        ])
        return {
            total: info.total.toString(),
            claimed: info.claimed.toString(),
            locked: utils.toBN(info.total).sub(utils.toBN(info.claimed)).toString(),
            claimable: claimable.toString(),
        }
    }

    claimable(account) {
        return this.vesting.methods.claimable(account).call()
    }

    claim(options = {}) {
        return this.web3Client.send(this.vesting.methods.claim(), options)
    }
}

module.exports = Vesting
