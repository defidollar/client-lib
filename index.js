const Web3 = require('web3')
const web3 = new Web3()

const toBN = web3.utils.toBN
const SCALE_18 = toBN(10).pow(toBN(18))

class DefiDollarClient {
    constructor(web3, config) {
        this.web3 = web3
        this.config = config
        this.peak = new web3.eth.Contract(IPeak.abi)
    }

    /**
     * @dev Mint DUSD
     * @param tokens { { DAI: '6.1' }, { USDT: '8.2' } }
     * @param minDusdAmount
     */
    mint(tokens, dusdAmount, slippage) {
        Object.keys(tokens).forEach(t => {
            tokens[t] = parseInt(tokens[t])
            if (!tokens[t]) delete tokens[t]
        })
        const allPeaks = this.config.contracts.peaks
        const peaks = Object.keys(allPeaks)
        for (let i = 0; i < peaks.length; i++) {
            const { isValid, isNative, inAmount } = this.checkValid(peak, tokens)
            if (!isValid) continue;
            this.peak.options.address = peak.address
            const minDusdAmount = toBN(dusdAmount).mul(toBN(100 - slippage)).div(toBN(100))
            if (isNative) {
                return this.peak.methods.mintWithCurvePoolTokens(inAmount, minDusdAmount)
            } else {
                return this.peak.methods.mint(inAmount, minDusdAmount)
            }
        }
        throw new Error(`No supported peak for token combination of ${tokens}`)
    }

    checkValid(peak, tokens) {
        // check native token
        if (tokens[peak.native]) {
            // no other tokens allowed
            if (Object.keys(tokens).length > 1) {
                throw new Error(`Native tokens ${peak.native} provided with other tokens ${tokens}`)
            }
            return { isValid: true, isNative: true, inAmount: toWei(tokens[peak.native]) }
        }
        let isValid = true
        Object.keys(tokens).forEach(t => {
            if (!peak.coins.includes(t)) {
                isValid = false
            }
        })
        if (!isValid) return { isValid: false }
        const inAmount = []
        peak.coins.forEach(c => {
            inAmount.push(tokens[c]|| 0)
        })
        return { isValid: true, inAmount }
    }

    scale(num, decimals) {
        return toBN(num).mul(toBN(10).pow(toBN(decimals)))
    }
}
