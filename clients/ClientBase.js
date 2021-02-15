const Web3 = require("web3");

const toBN = Web3.utils.toBN;
const toWei = Web3.utils.toWei;
const TEN_THOUSAND = toBN(10000);

class ClientBase {
  constructor(config) {
    this.config = config;
    this.yVaultPeak = config.contracts.peaks.yVaultPeak;
  }

  adjustForSlippage(amount, decimals, slippage) {
    slippage = parseFloat(slippage);
    if (isNaN(slippage) || slippage < 0 || slippage > 100) {
      throw new Error(`Invalid slippage value: ${slippage} provided`);
    }
    amount = decimals ? this.scale(amount, decimals) : toBN(amount);
    if (amount.eq(toBN(0)) || slippage == 0) return amount.toString();
    return toBN(amount)
      .mul(TEN_THOUSAND.sub(toBN(parseFloat(slippage) * 100)))
      .div(TEN_THOUSAND)
      .toString();
  }

  scale(num, decimals) {
    num = toBN(toWei(num.toString()));
    if (decimals < 18) {
      num = num.div(toBN(10).pow(toBN(18 - decimals)));
    } else if (decimals > 18) {
      num = num.mul(toBN(10).pow(toBN(decimals - 18)));
    }
    return num;
  }

  _processAmounts(tokens) {
    Object.keys(tokens).forEach((t) =>
      assert.ok(this.yVaultPeak.coins.includes(t), "bad coins")
    );
    const inAmounts = new Array(4);
    for (let i = 0; i < this.yVaultPeak.coins.length; i++) {
      const c = this.yVaultPeak.coins[i];
      if (tokens[c]) {
        inAmounts[i] = this.scale(
          tokens[c],
          this.config.contracts.tokens[c].decimals
        ).toString();
      } else {
        inAmounts[i] = 0;
      }
    }
    return inAmounts;
  }

  _sanitizeTokens(tokens) {
    Object.keys(tokens).forEach((t) => {
      if (!tokens[t] || isNaN(parseFloat(tokens[t]))) delete tokens[t];
    });
  }
}

module.exports = ClientBase;
