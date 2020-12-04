const Web3 = require('web3')

const Web3Client = require('./Web3Client')

const ibDfd = require('../artifacts/ibDfd.json')
const IERC20 = require('../artifacts/ERC20Detailed.json')
const utils = require('./utils')
const { toBN, toWei, fromWei } = utils

class ibDFDClient {
    constructor(web3, config) {
        web3 = web3 || new Web3()
        this.web3Client = new Web3Client(web3)
        this.config = config
        this.ibDfd = new web3.eth.Contract(ibDfd.abi, config.contracts.tokens.ibDFD.address)
        this.dfd = new web3.eth.Contract(IERC20.abi, config.contracts.tokens.DFD.address)
    }

    /**
     * @param {*} amount # dfd to deposit
     * @param {*} options Tx options
     */
    deposit(amount, options = {}) {
        const txObject = this.ibDfd.methods.deposit(toWei(amount.toString()))
        return this.web3Client.send(txObject, options)
    }

    /**
     * @param {*} amount ~ # of dfd to withdraw - NOT Shares. Will be ignored if isMax is provided.
     * @param {*} isMax Whether the user opted to exit completely
     * @param {*} options Tx options
     */
    async withdraw(amount, isMax, options = {}) {
        let shares
        if (isMax) {
            shares = await this.ibDfd.methods.balanceOf(options.from).call()
        } else {
            shares = utils.scale(amount, 36).div(toBN(await this.ibDfd.methods.getPricePerFullShare().call()))
        }
        const txObject = this.ibDfd.methods.withdraw(shares.toString())
        return this.web3Client.send(txObject, options)
    }

    /**
     * @notice ibDfd and dfd Balance
     * @return { ibDfd, dfd, withrawable } in wei
     * ibDfd - ibDfd balance
     * withrawable - dfd withrawable from the savings ibDfd contract
     * dfd - dfd wallet balance
     */
    async balanceOf(account) {
        const [ibDfd, pricePerFullShare, dfd] = await Promise.all([
            this.ibDfd.methods.balanceOf(account).call(),
            this.ibDfd.methods.getPricePerFullShare().call(),
            this.dfd.methods.balanceOf(account).call()
        ])
        return { ibDfd, withrawable: fromWei(toBN(ibDfd).mul(toBN(pricePerFullShare))), dfd }
    }

    /**
     * @notice dfd allowance for the savings contract
     */
    allowance(account) {
        return this.dfd.methods.allowance(account, this.ibDfd.options.address).call()
    }

    /**
     * @notice approve
     * @param amount Amount without having accounted for decimals
     */
    approve(amount, options = {}, trust = false) {
        const txObject = this.dfd.methods.approve(
            this.ibDfd.options.address,
            trust ? amount : toWei(amount.toString())
        )
        return this.web3Client.send(txObject, options)
    }
}

module.exports = ibDFDClient
