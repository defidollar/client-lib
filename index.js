const Web3 = require('web3')

const IERC20 = require('./artifacts/ERC20Detailed.json')
const IPeak = require('./artifacts/IPeak.json')
const StakeLPToken = require('./artifacts/StakeLPToken.json')

const toBN = Web3.utils.toBN
const toWei = Web3.utils.toWei
const SCALE_18 = toBN(10).pow(toBN(18))
const TEN_THOUSAND = toBN(10000)

class DefiDollarClient {
    constructor(web3, config) {
        this.web3 = web3 || new Web3()
        this.config = config
        this.IERC20 = new this.web3.eth.Contract(IERC20.abi)
        this.peak = new this.web3.eth.Contract(IPeak.abi)
        this.valley = new this.web3.eth.Contract(StakeLPToken.abi, config.contracts.valley)
    }

    /**
     * @notice Mint DUSD
     * @dev Don't send values scaled with decimals. The following code will handle it.
     * @param tokens InAmounts in the format { DAI: '6.1', USDT: '0.2', ... }
     * @param dusdAmount Expected dusd amount not accounting for the slippage
     * @param slippage Maximum allowable slippage 0 <= slippage <= 100
     */
    mint(tokens, dusdAmount, slippage, options = {}) {
        const { peak, amount, isNative } = this._process(tokens)
        let minDusdAmount = scale(parseInt(dusdAmount), 18)
            .mul(TEN_THOUSAND.sub(toBN(parseFloat(slippage) * 100)))
            .div(TEN_THOUSAND)
            .toString()
        this.peak.options.address = peak.address
        let txObject
        if (isNative) {
            txObject = this.peak.methods.mintWithCurvePoolTokens(amount, minDusdAmount)
        } else {
            txObject = this.peak.methods.mint(amount, minDusdAmount)
        }
        return this._send(txObject, options)
    }

    /**
     * @notice Redeem DUSD
     * @dev Don't send values scaled with decimals. The following code will handle it.
     * @param tokens OutAmounts in the format { DAI: '6.1', USDT: '0.2', ... }
     * @param dusdAmount Expected dusd amount not accounting for the slippage
     * @param slippage Maximum allowable slippage 0 <= slippage <= 100
     */
    redeem(tokens, dusdAmount, slippage, options = {}) {
        const { peak, amount, isNative } = this._process(tokens)
        let maxDusdAmount = scale(parseInt(dusdAmount), 18)
            .mul(TEN_THOUSAND.add(toBN(parseFloat(slippage) * 100)))
            .div(TEN_THOUSAND)
            .toString()
        this.peak.options.address = peak.address
        let txObject
        if (isNative) {
            txObject = this.peak.methods.redeemWithCurvePoolTokens(amount, maxDusdAmount)
        } else {
            txObject = this.peak.methods.redeem(amount, maxDusdAmount)
        }
        return this._send(txObject, options)
    }

    stake(amount, options = {}) {
        return this._send(
            this.valley.methods.stake(toWei(amount.toString())),
            options
        )
    }

    withdraw(amount, options = {}) {
        return this._send(
            this.valley.methods.withdraw(toWei(amount.toString())),
            options
        )
    }

    getReward(options = {}) {
        return this._send(
            this.valley.methods.getReward(),
            options
        )
    }

    exit(options = {}) {
        return this._send(
            this.valley.methods.exit(),
            options
        )
    }

    earned(account) {
        return this.valley.methods.earned(account).call()
    }

    /**
     * @notice calcExpectedAmount of DUSD that will be minted or redeemed
     * @dev Don't send values scaled with decimals. The following code will handle it.
     * @param tokens amounts in the format { DAI: '6.1', USDT: '0.2', ... }
     * @param deposit deposit=true, withdraw=false
     * @return expectedAmount and address of the chosen peak
     */
    async calcExpectedAmount(tokens, deposit) {
        const { peak, amount, isNative } = this._process(tokens)
        this.peak.options.address = peak.address
        let expectedAmount
        if (isNative) {
            expectedAmount = await this.peak.methods.calcExpectedWithCurvePoolTokens(amount).call()
        } else {
            expectedAmount = await this.peak.methods.calcExpectedAmount(amount, deposit).call()
        }
        return { expectedAmount, peak: peak.address }
    }

    _process(tokens) {
        Object.keys(tokens).forEach(t => {
            tokens[t] = parseInt(tokens[t])
            if (!tokens[t]) delete tokens[t]
        })
        const allPeaks = this.config.contracts.peaks
        const peaks = Object.keys(allPeaks)
        for (let i = 0; i < peaks.length; i++) {
            const peak = allPeaks[peaks[i]]
            const { isValid, isNative, amount } = this._validateTokensForPeak(peak, tokens)
            if (!isValid) continue;
            return { peak, amount, isNative }
        }
        throw new Error(`No supported peak for token combination ${tokens}`)
    }

    _validateTokensForPeak(peak, tokens) {
        // check native token
        if (tokens[peak.native]) {
            // no other tokens allowed
            if (Object.keys(tokens).length > 1) {
                throw new Error(`Native tokens ${peak.native} provided with other tokens ${tokens}`)
            }
            return { isValid: true, isNative: true, amount: scale(tokens[peak.native], 18).toString() }
        }

        // should only have coins that the peak supports
        let isValid = true
        Object.keys(tokens).forEach(t => {
            if (!peak.coins.includes(t)) {
                isValid = false
            }
        })
        if (!isValid) return { isValid }

        // Push coins in the same order as required by the peak
        const amount = []
        peak.coins.forEach(c => {
            amount.push(
                tokens[c] ? scale(tokens[c], this.config.contracts.tokens[c].decimals).toString() : 0
            )
        })
        return { isValid: true, amount }
    }

    async _send(txObject, options) {
        if (!options.from) throw new Error('from field is not provided')
        if (!options.gasLimit) {
            const gasLimit = parseInt(await txObject.estimateGas({ from: options.from }))
            options.gasLimit = parseInt(gasLimit * 1.5)
        }
        options.gasPrice = options.gasPrice || await this.web3.eth.getGasPrice()
        return txObject.send(options)
    }

    // ##### Common Functions #####

    /**
     * @notice balanceOf
     * @dev Scales down the value only if decimals param is provided
     * @param token Contract address or supported token ids DAI, USDC, USDT ...
     * @param account Account
     * @return balance
     */
    async balanceOf(token, account, decimals) {
        token = this._processTokenId(token)
        this.IERC20.options.address = token
        if (!this.IERC20.options.address) {
            throw new Error(`tokenId ${tokenId} is not supported`)
        }
        let bal = await this.IERC20.methods.balanceOf(account).call()
        if (decimals) {
            bal = unscale(bal, decimals)
        }
        return bal
    }

    /**
     * @notice approve
     * @param token ERC20 token contract
     * @param spender Spender
     * @param amount Amount not scaled for decimals
     */
    async approve(token, spender, amount, options = {}) {
        token = this._processTokenId(token)
        this.IERC20.options.address = token
        if (!this.IERC20.options.address) throw new Error(`tokenId ${tokenId} is not known`)
        const txObject = this.IERC20.methods.approve(
            spender,
            scale(amount, await this.IERC20.methods.decimals().call()).toString()
        )
        return this._send(txObject, options)
    }

    allowance(token, account, spender) {
        token = this._processTokenId(token)
        this.IERC20.options.address = token
        return this.IERC20.methods.allowance(account, spender).call()
    }

    _processTokenId(token) {
        return token.slice(0, 2) !== '0x' ? this.config.contracts.tokens[token].address : token
    }
}

function scale(num, decimals) {
    return toBN(num).mul(toBN(10).pow(toBN(decimals)))
}

function unscale(num, decimals) {
    return toBN(num).div(toBN(10).pow(toBN(decimals)))
}

module.exports = DefiDollarClient
