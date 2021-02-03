class Web3Client {
    constructor(web3) {
        this.web3 = web3
    }

    async send(txObject, options) {
        if (!options.from) throw new Error('from field is not provided')
        if (!options.gas) {
            const gasLimit = parseInt(await txObject.estimateGas({ from: options.from }))
            options.gas = parseInt(gasLimit * 1.5)
        }
        options.gasPrice = options.gasPrice || await this.web3.eth.getGasPrice()
        if (options.transactionHash == true) {
            return this._wrapWeb3Promise(txObject.send(options))
        }
        return txObject.send(options)
    }

    async hackySend(txObject, options) {
        options.gas = Math.max(412000, options.gas || 0)
        return this.send(txObject, options)
    }

    _wrapWeb3Promise(obj) {
        return new Promise((resolve, reject) => {
            obj
            .on('transactionHash', txHash => resolve(txHash))
            .on('error', err => reject(err))
        })
    }
}

module.exports = Web3Client
