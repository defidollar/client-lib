const Web3 = require('web3')
const assert = require('assert').strict;

const IERC20 = require('./artifacts/ERC20Detailed.json')
const IPeak = require('./artifacts/YVaultPeak.json')
const zap = require('./artifacts/YVaultZap.json')
const StakeLPToken = require('./artifacts/StakeLPToken.json')
const Core = require('./artifacts/Core.json')

const toBN = Web3.utils.toBN
const toWei = Web3.utils.toWei
const SCALE_18 = toBN(10).pow(toBN(18))
const TEN_THOUSAND = toBN(10000)

class DefiDollarClient {
    constructor(web3, config) {
        this.web3 = web3 || new Web3()
        this.config = config
        this.yVaultPeak = this.config.contracts.peaks.yVaultPeak
        this.IERC20 = new this.web3.eth.Contract(IERC20.abi)
        this.peak = new this.web3.eth.Contract(IPeak.abi, this.yVaultPeak.address)
        this.zap = new this.web3.eth.Contract(zap.abi, this.yVaultPeak.zap)
        this.core = new this.web3.eth.Contract(Core.abi, config.contracts.base)
        this.valley = new this.web3.eth.Contract(StakeLPToken.abi, config.contracts.valley)
    }

    /**
     * @notice Mint DUSD
     * @dev Don't send values scaled with decimals. The following code will handle it.
     * @param tokens InAmounts in the format { DAI: '6.1', USDT: '0.2', ... }
     * @param dusdAmount Expected dusd amount not accounting for the slippage
     * @param slippage Maximum allowable slippage 0 <= slippage <= 100 %
     */
    mint(tokens, dusdAmount, slippage, options = {}) {
        // console.log('mint', { tokens, dusdAmount, slippage, options })
        this._sanitizeTokens(tokens)
        let txObject
        if (Object.keys(tokens).length === 1 && (tokens.yCRV || tokens.yUSD)) {
            if (tokens.yCRV) {
                txObject = this.peak.methods.mintWithYcrv(scale(tokens.yCRV, 18).toString())
            } else if (tokens.yUSD) {
                txObject = this.peak.methods.mintWithYusd(scale(tokens.yUSD, 18).toString())
            }
        } else { // mint with 1 or more of the vanilla coins
            const minDusdAmount = this.adjustForSlippage(dusdAmount, 18, slippage).toString()
            txObject = this.zap.methods.mint(this._processAmounts(tokens), minDusdAmount)
        }
        if (!txObject) {
            throw new Error(`couldn't find a suitable combination with tokens ${tokens.toString()}`)
        }
        return this._send(txObject, options)
    }

    /**
     * @notice calcExpectedAmount of DUSD that will be minted or redeemed
     * @dev Don't send values scaled with decimals. The following code will handle it.
     * @param tokens amounts in the format { DAI: '6.1', USDT: '0.2', ... }
     * @param deposit deposit=true, withdraw=false
     * @return expectedAmount and address of the chosen peak
     */
    async calcExpectedMintAmount(tokens) {
        console.log('calcExpectedMintAmount', { tokens })
        this._sanitizeTokens(tokens)
        let expectedAmount
        if (Object.keys(tokens).length === 1 && (tokens.yCRV || tokens.yUSD)) {
            if (tokens.yCRV) {
                expectedAmount = await this.peak.methods.calcMintWithYcrv(scale(tokens.yCRV, 18)).call()
            } else if (tokens.yUSD) {
                expectedAmount = await this.peak.methods.calcMintWithYusd(scale(tokens.yUSD, 18)).call()
            }
            return { expectedAmount, peak: this.yVaultPeak.address }
        }
        expectedAmount = await this.zap.methods.calcMint(this._processAmounts(tokens)).call()
        return { expectedAmount, peak: this.zap.options.address }
    }

    _sanitizeTokens(tokens) {
        Object.keys(tokens).forEach(t => {
            if (!tokens[t] || isNaN(parseFloat(tokens[t]))) delete tokens[t]
        })
    }

    _processAmounts(tokens) {
        Object.keys(tokens).forEach(t => assert.ok(this.yVaultPeak.coins.includes(t), 'bad coins'))
        const inAmounts = new Array(4)
        for(let i = 0; i < this.yVaultPeak.coins.length; i++) {
            const c = this.yVaultPeak.coins[i]
            if (tokens[c]) {
                inAmounts[i] = scale(tokens[c], this.config.contracts.tokens[c].decimals).toString()
            } else {
                inAmounts[i] = 0
            }
        }
        return inAmounts
    }

    /**
     * @notice Redeem DUSD
     * @dev Don't send values scaled with decimals. The following code will handle it.
     * @param tokens OutAmounts in the format { DAI: '6.1', USDT: '0.2', ... }
     * @param dusdAmount Expected dusd amount not accounting for the slippage
     * @param slippage Maximum allowable slippage 0 <= slippage <= 100
     */
    redeem(dusdAmount, tokens, slippage, options = {}) {
        this._sanitizeTokens(tokens)
        let txObject
        dusdAmount = toWei(dusdAmount)
        if (Object.keys(tokens).length === 1) {
            if (tokens.yCRV) {
                txObject = this.peak.methods.redeemInYcrv(
                    dusdAmount,
                    this.adjustForSlippage(tokens.yCRV, 18, slippage)
                )
            } else if (tokens.yUSD) {
                txObject = this.peak.methods.redeemInYusd(
                    dusdAmount,
                    this.adjustForSlippage(tokens.yUSD, 18, slippage)
                )
            } else {
                const c = Object.keys(tokens)[0]
                const index = this.yVaultPeak.coins.findIndex(key => key === c)
                txObject = this.zap.methods.redeemInSingleCoin(
                    dusdAmount,
                    index,
                    this.adjustForSlippage(tokens[c], this.config.contracts.tokens[c].decimals, slippage)
                )
            }
        } else {
            txObject = this.zap.methods.redeem(
                dusdAmount,
                this._processAmounts(tokens).map(a => this.adjustForSlippage(a, null, slippage))
            )
        }
        return this._send(txObject, options)
    }

    async calcExpectedRedeemAmount(dusdAmount, token) {
        console.log('calcExpectedRedeemAmount', { dusdAmount, token })
        dusdAmount = toWei(dusdAmount)
        let txObject
        if (!token) { // all tokens
            txObject = this.zap.methods.calcRedeem(dusdAmount)
        } else if (this.yVaultPeak.coins.includes(token)) { // single stablecoin
            const index = this.yVaultPeak.coins.findIndex(key => key === token)
            txObject = this.zap.methods.calcRedeemInSingleCoin(dusdAmount, index)
        } else if (token == 'yCRV') {
            txObject = this.peak.methods.calcRedeemInYcrv(dusdAmount)
        } else if (token == 'yUSD') {
            txObject = this.peak.methods.calcRedeemInYusd(dusdAmount)
        } else {
            throw new Error(`Invalid token id ${token} in calcExpectedRedeemAmount`)
        }
        const expectedAmount = await txObject.call()
        return { expectedAmount }
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
        return this._send(this.valley.methods.getReward(), options)
    }

    exit(options = {}) {
        return this._send(this.valley.methods.exit(), options)
    }

    earned(account) {
        return this.valley.methods.earned(account).call()
    }

    withdrawAble(account) {
        return this.valley.methods.withdrawAble(account).call()
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
        let from = toBN(events[0].raw.topics[2].slice(2), 'hex') // first ever event
        let to = toBN(parseInt(Date.now() / 1000))
        if (to.lte(from)) { // same block
            to = from.add(toBN(1))
        }
        // console.log({ rewardPerToken, year, to: to.toString(), from: from.toString() })
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

    async ceiling() {
        let { ceiling, amount } = await this.core.methods.peaks(this.config.contracts.peaks.yVaultPeak.address).call()
        ceiling = toBN(ceiling)
        amount = toBN(amount)
        let available = 0
        if (ceiling.gt(amount)) {
            available = ceiling.sub(amount).toString()
        }
        return { ceiling: ceiling.toString(), available }
    }

    adjustForSlippage(amount, decimals, slippage) {
        slippage = parseFloat(slippage)
        if (isNaN(slippage) || slippage < 0 || slippage > 100) {
            throw new Error(`Invalid slippage value: ${slippage} provided`)
        }
        amount = decimals ? scale(amount, decimals) : toBN(amount)
        if (amount.eq(toBN(0)) || slippage == 0) return amount.toString()
        return toBN(amount)
            .mul(TEN_THOUSAND.sub(toBN(parseFloat(slippage) * 100)))
            .div(TEN_THOUSAND)
            .toString()
    }

    async _send(txObject, options) {
        if (!options.from) throw new Error('from field is not provided')
        if (!options.gasLimit) {
            const gasLimit = parseInt(await txObject.estimateGas({ from: options.from }))
            options.gasLimit = parseInt(gasLimit * 1.2)
        }
        options.gasPrice = options.gasPrice || await this.web3.eth.getGasPrice()
        if (options.transactionHash == true) {
            return this._wrapWeb3Promise(txObject.send(options))
        }
        return txObject.send(options)
    }

    _wrapWeb3Promise(obj) {
        return new Promise((resolve, reject) => {
            obj
            .on('transactionHash', txHash => resolve(txHash))
            .on('error', err => reject(err))
        })
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
     * @param decimals Decimals to scale the amount with. Otherwise send null
     */
    async approve(token, spender, amount, decimals, options = {}) {
        token = this._processTokenId(token)
        this.IERC20.options.address = token
        if (!this.IERC20.options.address) throw new Error(`tokenId ${tokenId} is not known`)
        const txObject = this.IERC20.methods.approve(
            spender,
            decimals ? scale(amount, decimals).toString() : amount.toString()
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
