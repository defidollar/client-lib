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
        let minDusdAmount = toBN(toWei(dusdAmount))
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
            this.valley.methods.stake(scale(amount, 18).toString()),
            options
        )
    }

    withdraw(amount, options = {}) {
        return this._send(
            this.valley.methods.withdraw(scale(amount, 18).toString()),
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

    async getAPY(days) {
        const res = { allTime: 0 }
        days = parseInt(days)
        if (days) res[days] = 0
        const events = await this.valley.getPastEvents('RewardPerTokenUpdated', { fromBlock: 0 })
        // event RewardPerTokenUpdated(uint indexed rewardPerToken, uint indexed when);
        // first event is first stake event when rewardPerTokenStored was definitely 0
        if (!events.length) return res

        const year = toBN('3153600000') // 24*60*60*365*100% = 3,15,36,00,000
        const rewardPerToken = toBN(await this.valley.methods.updateProtocolIncome().call())

        // all time
        const to = toBN(parseInt(Date.now() / 1000))
        let from = toBN(events[0].raw.topics[2].slice(2), 'hex') // first ever event
        res.allTime = rewardPerToken.mul(year).div(SCALE_18).div(to.sub(from)).toString()

        if (!days) return res

        // last `days` days
        let past = parseInt(Date.now() / 1000) - 86400 * parseInt(days)
        let index = 0
        for (let i = events.length-1; i >=0; i--) {
            if (parseInt(toBN(events[i].raw.topics[2].slice(2), 'hex').toString()) <= past) {
                index = i
                break
            }
        }
        res[days] = rewardPerToken
            .sub(toBN(events[index].raw.topics[1].slice(2), 'hex'))
            .mul(year).div(SCALE_18)
            .div(to.sub(toBN(events[index].raw.topics[2].slice(2), 'hex')))
            .toString()
        return res
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
     * @param token Contract address or supported token ids DAI, USDC, USDT ...
     * @param account Account
     * @return balance
     */
    async balanceOf(token, account) {
        token = this._processTokenId(token)
        this.IERC20.options.address = token
        if (!this.IERC20.options.address) {
            throw new Error(`tokenId ${tokenId} is not supported`)
        }
        return this.IERC20.methods.balanceOf(account).call()
    }

    /**
     * @notice approve
     * @param token ERC20 token contract
     * @param spender Spender
     * @param amount Amount Pass without having accounted for decimals
     */
    async approve(token, spender, amount, decimals, options = {}) {
        token = this._processTokenId(token)
        this.IERC20.options.address = token
        if (!this.IERC20.options.address) throw new Error(`tokenId ${tokenId} is not known`)
        const txObject = this.IERC20.methods.approve(
            spender,
            scale(amount, decimals).toString()
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
    num = toBN(toWei(num.toString()))
    if (decimals < 18) {
        num = num.div(toBN(10).pow(toBN(18 - decimals)))
    } else if (decimals > 18) {
        num = num.mul(toBN(10).pow(toBN(decimals - 18)))
    }
    return num
}

module.exports = DefiDollarClient
