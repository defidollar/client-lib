const fs = require('fs');

const contracts = [
  'ERC20Detailed.json',
  'YVaultPeak.json',
  'YVaultZap.json',
  'StakeLPToken.json',
  'Core.json',
  'DFDRewards.json',
  'TokenVesting.json',
  'ibDUSD.json',
  'ibDFD.json'
]

const artifacts = fs.readdirSync(`artifacts`)
  artifacts.forEach(a => {
    const name = `artifacts/${a}`
    const abi = JSON.parse(fs.readFileSync(name)).abi
    if (!abi.length || !contracts.includes(a)) {
      fs.unlinkSync(name)
    } else {
      fs.writeFileSync(name, JSON.stringify({ abi }) + '\n')
    }
})
