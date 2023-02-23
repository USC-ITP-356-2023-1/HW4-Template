// Start - Support direct Mocha run & debug
import 'hardhat'
import '@nomiclabs/hardhat-ethers'
// End - Support direct Mocha run & debug

import chai, {expect} from 'chai'
import {before} from 'mocha'
import {solidity} from 'ethereum-waffle'
import {deployContract, signer} from './framework/contracts'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {successfulTransaction} from './framework/transaction'
import {HW4} from '../typechain-types'
import {ethers} from 'ethers'

chai.use(solidity)

// Think of "describe" as a folder
describe('HW4: 4%', () => {
    /*
     * Declaring variables that will be used in the tests
     * Declaring them here allows them to be used in multiple tests
     */
    let contract: HW4
    let s0: SignerWithAddress, s1: SignerWithAddress
    let s0Addr: string, s1Addr: string

    // "before" runs before all tests only once
    before(async () => {
        // Get the signers, aka the accounts that will be used in the tests
        s0 = await signer(0) // Signer 0 is the deployer
        s1 = await signer(1)
        s0Addr = s0.address
        s1Addr = s1.address
    })

    // "beforeEach" runs before each test
    beforeEach(async () => {
        // Deploy the contract so that each test has a fresh contract
        contract = await deployContract<HW4>('HW4')
    })

    describe('2) Splitter: 4%', () => {
        let recipients: string[]
        // "depositAmount" is the amount of wei that will be deposited into the contract, randomly chosen
        const depositAmount = ethers.utils.parseEther(
            `${Math.floor(Math.random() * 10)}`
        )

        before(() => {
            recipients = [s0Addr, s1Addr]
        })

        // "it" is a single test case
        it('1. Ownable: 0.5%', async () => {
            /*
             * "expect" is the assertion library
             * Here, we are asserting that the contract's owner is the signer that deployed the contract (first signer)
             */
            expect(await contract.owner()).equals(s0Addr)
            /*
             * Now, we are transferring ownership to the second signer
             * ".connect()" calls the contract as the signer provided
             */
            const tx = await contract.connect(s0).transferOwnership(s1Addr)
            // Here, we are asserting that the transaction was successful and events were emitted
            await expect(tx)
                .to.emit(contract, 'OwnershipTransferred')
                .withArgs(s1Addr)
            // Here, we are asserting that the contract's owner is the second signer
            expect(await contract.owner()).equals(s1Addr)
            // Here, we are asserting that the first signer is no longer the owner and that the transaction will revert
            await expect(contract.connect(s0).transferOwnership(s0Addr)).to.be
                .reverted
        })
        it('2. Pausable: 0.5%', async () => {
            // Here, we are asserting that the contract is not paused
            expect(await contract.paused()).equals(false)
            // Here, we are pausing the contract as the deployer
            await contract.connect(s0).togglePause()
            // Here, we are asserting that the contract is paused
            expect(await contract.paused()).equals(true)
        })
        describe('3. Deposit: 1.5%', () => {
            it('A. deposit() + balanceOf(): 1.2%', async () => {
                // Here, we are depositing into the contract as signer 0
                const tx = await contract.connect(s0).deposit(recipients, {
                    value: depositAmount
                })
                // Here, we are asserting that the transaction was successful and events were emitted
                await expect(tx)
                    .to.emit(contract, 'DidDepositFunds')
                    .withArgs(depositAmount, recipients)
                const balanceS0 = await contract.balanceOf(s0Addr)
                // Here, we are asserting that the balance for a single recipient is correct
                expect(balanceS0).equals(depositAmount.div(recipients.length))
            })
            it('B. deposit() cannot run while paused: 0.3%', async () => {
                await contract.connect(s0).togglePause()
                // Here, we are asserting that the transaction will revert because the contract is paused
                await expect(
                    contract.connect(s0).deposit(recipients, {
                        value: depositAmount
                    })
                ).to.be.reverted
            })
        })
        describe('4. Withdraw: 1.5%', () => {
            it('A. Normal withdraw(): 0.9%', async () => {
                const startingBalanceS0 = await s0.getBalance()
                const startingBalanceS1 = await s1.getBalance()
                // Here, we are depositing into the contract as signer 0
                const receiptS0Deposit = await successfulTransaction(
                    contract.connect(s0).deposit(recipients, {
                        value: depositAmount
                    })
                )
                const withdrawAmount = await contract.balanceOf(s0Addr)
                // Here, we are withdrawing from the contract as signer 0
                const txS0 = await contract.connect(s0).withdraw(withdrawAmount)
                const receiptS0 = await txS0.wait()
                const receiptS1 = await successfulTransaction(
                    contract.connect(s1).withdraw(withdrawAmount)
                )
                await expect(txS0)
                    .to.emit(contract, 'DidWithdrawFunds')
                    .withArgs(withdrawAmount, s0.address)
                /*
                 * Here, we are asserting that the current balance of signer 0 is equal to
                 * the starting balance plus the amount deposited minus the gas used
                 */
                expect(await s0.getBalance()).equals(
                    startingBalanceS0
                        .sub(depositAmount)
                        .sub(
                            receiptS0Deposit.gasUsed.mul(
                                receiptS0Deposit.effectiveGasPrice
                            )
                        )
                        .sub(receiptS0.gasUsed.mul(receiptS0.effectiveGasPrice))
                        .add(withdrawAmount)
                )
                expect(await s1.getBalance()).equals(
                    startingBalanceS1
                        .sub(receiptS1.gasUsed.mul(receiptS1.effectiveGasPrice))
                        .add(withdrawAmount)
                )
            })
            it('B. withdraw() overdraft should fail: 0.3%', async () => {
                await contract.connect(s0).deposit(recipients, {
                    value: depositAmount
                })
                const withdrawAmount = await contract.balanceOf(s0Addr)
                await expect(
                    contract.connect(s1).withdraw(withdrawAmount.mul(2))
                ).to.be.reverted
            })
            it('C. withdraw() cannot run while paused: 0.3%', async () => {
                await contract.connect(s0).togglePause()
                await expect(contract.connect(s0).withdraw(0)).to.be.reverted
            })
        })
    })
})
