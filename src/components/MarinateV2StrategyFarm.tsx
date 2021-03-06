import React from 'react'
import { formatUnits, parseUnits } from '@ethersproject/units'
import { BigNumber, Contract } from 'ethers'
import { Formik, Form, Field } from 'formik'

import DashboardCard from './DashboardCard'
import Selector from './Selector'

import useUserAddress from '../hooks/useUserAddress'
import useUserSigner from '../hooks/useUserSigner'
import useExternalContractLoader from '../hooks/useExternalContractLoader'
import useTransaction, { notify } from '../hooks/useTransaction'
import useGlobalState from '../hooks/useGlobalState'

import mUMAMIAutocompounderFarm from '../contracts/mUMAMIAutocompounderFarm.address'
import MarinateV2StrategyABI from '../contracts/MarinateV2Strategy.abi'
import MarinateV2StrategyFarmABI from '../contracts/MarinateV2StrategyFarm.abi'
import ERC20ABI from '../contracts/ERC20.abi'

// testnet address 0xE91205e3FE022B601075adb1CDAe5F2294Bf5240

const farmName = 'Step 2. Boost with $ARBIS Rewards'
const farmAddress = mUMAMIAutocompounderFarm
const farmAbi = MarinateV2StrategyFarmABI

type Reward = { address: string; symbol: string; availableTokenRewards: number }

function Countdown({ unlockTime }: { unlockTime: number }) {
  const [remaining, setRemaining] = React.useState<number | null>(null)

  const handleDates = React.useCallback(() => {
    setInterval(() => {
      const then = new Date(unlockTime * 1000).getTime()
      const curr = new Date().getTime()
      setRemaining(then - curr)
    }, 1000)
  }, [unlockTime])

  const segments = React.useMemo(() => {
    if (!remaining) {
      return null
    }

    return {
      days: Math.floor(remaining / (1000 * 60 * 60 * 24)),
      hours: Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((remaining % (1000 * 60)) / 1000),
    }
  }, [remaining])

  React.useEffect(() => {
    handleDates()
  }, [handleDates])

  return segments ? (
    <div>
      <span>{segments.days} days, </span>
      <span>{segments.hours}h, </span>
      <span>{segments.minutes}m, </span>
      <span>{segments.seconds}s</span>
    </div>
  ) : (
    <span>Unlock Time</span>
  )
}

export default function MarinateV2StrategyFarm() {
  const initFarmState: {
    [k: string]: string | number | boolean | null
  } = {
    lastDepositTime: null,
    unlockTime: null,
    stakedBalance: null,
    totalStaked: null,
    tokenBalance: null,
    isApproved: false,
    isInitialized: false,
  }
  const initTokenState: {
    [k: string]: string | number | boolean | null
  } = {
    name: null,
    symbol: null,
    address: null,
    tokensPerShare: null,
  }

  const [farmState, setFarmState] = React.useState(initFarmState)
  const [tokenState, setTokenState] = React.useState(initTokenState)
  const [rewardsState, setRewardsState] = React.useState<Reward[]>([])
  const [compoundedTokenSymbol, setCompoundedTokenSymbol] = React.useState(null)
  const [action, setAction] = React.useState<'deposit' | 'withdraw'>('deposit')
  const [{ horseysauce }] = useGlobalState()

  const userAddress = useUserAddress()
  const userSigner = useUserSigner()
  const transaction = useTransaction()

  const farmContract = useExternalContractLoader(farmAddress, farmAbi)

  const tokenContract = useExternalContractLoader(
    tokenState.address as string | null,
    MarinateV2StrategyABI
  )

  const handleTokenAddress = React.useCallback(async () => {
    if (!farmContract) {
      return
    }

    try {
      const address = await farmContract.STOKEN()
      setTokenState({ ...tokenState, address })
    } catch (err) {
      console.log({
        err,
        callingFunc: 'handleTokenAddress',
        callingFarmName: farmName,
      })
    }
  }, [farmContract, tokenState])

  const handleCompoundedTokenSymbol = React.useCallback(async () => {
    if (!userSigner || !tokenContract || compoundedTokenSymbol) {
      return
    }

    try {
      const address = await tokenContract.depositToken()
      const contract = new Contract(address, ERC20ABI, userSigner)
      setCompoundedTokenSymbol(await contract.symbol())
    } catch (err) {
      console.log({
        err,
        callingFunc: 'handleCompoundedTokenSymbol',
        callingFarmName: farmName,
      })
    }
  }, [tokenContract, compoundedTokenSymbol, userSigner])

  const handleRewards = React.useCallback(async () => {
    if (!userSigner || !farmContract || !userAddress || !tokenState.address) {
      return
    }

    try {
      const address = await farmContract.rewardTokens(0)
      const rewardContract = new Contract(address, ERC20ABI, userSigner)

      const [symbol, rewards] = await Promise.all([
        rewardContract.symbol(),
        farmContract.getAvailableTokenRewards(userAddress, address),
      ])

      const availableTokenRewards = Number(formatUnits(rewards, 18))

      setRewardsState([{ address, symbol, availableTokenRewards }])
    } catch (err) {
      console.log({
        err,
        callingFunc: 'handleRewards',
        callingFarmName: farmName,
      })
    }
  }, [userSigner, farmContract, userAddress, tokenState])

  const handleTokenState = React.useCallback(async () => {
    if (
      !tokenState.address ||
      !tokenContract ||
      tokenState.name ||
      tokenState.symbol
    ) {
      return
    }

    try {
      const [name, symbol, depositTokensPerShare] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.getDepositTokensForShares(parseUnits('1.0', 9)),
      ])
      const tokensPerShare = formatUnits(depositTokensPerShare, 9)
      setTokenState({ ...tokenState, name, symbol, tokensPerShare })
    } catch (err) {
      console.log({
        err,
        callingFunc: 'handleTokenState',
        callingFarmName: farmName,
      })
    }
  }, [tokenState, tokenContract])

  const handleFarmState = React.useCallback(async () => {
    if (
      !tokenState.address ||
      !farmContract ||
      !tokenContract ||
      !userAddress
    ) {
      return
    }
    try {
      const [farmerInfo, totalStaked, allowance, tokenBalance] =
        await Promise.all([
          farmContract.farmerInfo(userAddress),
          farmContract.totalStaked(),
          tokenContract.allowance(userAddress, farmAddress),
          tokenContract.balanceOf(userAddress),
        ])

      const isApproved = !BigNumber.from('0').eq(allowance)
      const { lastDepositTime, amount, unlockTime } = farmerInfo

      setFarmState({
        lastDepositTime,
        unlockTime,
        stakedBalance: formatUnits(amount, 9),
        totalStaked: formatUnits(totalStaked, 9),
        tokenBalance: formatUnits(tokenBalance, 9),
        isApproved,
        isInitialized: true,
      })
    } catch (err) {
      console.log({
        err,
        callingFunc: 'handleFarmState',
        callingFarmName: farmName,
      })
    }
  }, [tokenState.address, farmContract, tokenContract, userAddress])

  const handleDeposit = React.useCallback(
    async ({ depositAmount }, { resetForm }) => {
      if (!farmState.isApproved || !farmContract) {
        return
      }

      try {
        await transaction(
          farmContract.stake(parseUnits(String(depositAmount), 9))
        )
      } catch (err) {
        notify.notification({
          eventCode: 'txError',
          type: 'error',
          message: (err as Error).message,
          autoDismiss: 2000,
        })
      } finally {
        resetForm()
      }
    },
    [farmState.isApproved, farmContract, transaction]
  )

  const handleWithdraw = React.useCallback(
    async ({ withdrawAmount }, { resetForm }) => {
      if (!farmState.isApproved || !farmContract) {
        return
      }

      try {
        await transaction(farmContract.withdraw())
      } catch (err) {
        notify.notification({
          eventCode: 'txError',
          type: 'error',
          message: (err as Error).message,
          autoDismiss: 2000,
        })
      } finally {
        resetForm()
      }
    },
    [farmState.isApproved, farmContract, transaction]
  )

  const handleApproval = React.useCallback(async () => {
    if (!tokenContract || !tokenState.address) {
      return
    }

    try {
      await transaction(
        tokenContract.approve(
          farmAddress,
          parseUnits(String(Number.MAX_SAFE_INTEGER), 9)
        )
      )
    } catch (err) {
      notify.notification({
        eventCode: 'txError',
        type: 'error',
        message: (err as Error).message,
        autoDismiss: 2000,
      })
      console.log({
        err,
        callingFunc: 'handleApproval',
        callingFarmName: farmName,
      })
    }
  }, [tokenContract, transaction, tokenState.address])

  const handleClaim = React.useCallback(async () => {
    if (!farmState.isApproved || !farmContract) {
      return
    }

    try {
      await transaction(farmContract.claimRewards())
      const newRewardsState = rewardsState.map((reward) => ({
        ...reward,
        availableTokenRewards: 0,
      }))
      setRewardsState(newRewardsState)
    } catch (err) {
      notify.notification({
        eventCode: 'txError',
        type: 'error',
        message: (err as Error).message,
        autoDismiss: 2000,
      })
    }
  }, [farmContract, farmState.isApproved, transaction, rewardsState])

  React.useEffect(() => {
    if (tokenState.address === null) {
      handleTokenAddress()
    }
  }, [tokenState.address, handleTokenAddress])

  React.useEffect(() => {
    if (compoundedTokenSymbol === null) {
      handleCompoundedTokenSymbol()
    }
  }, [compoundedTokenSymbol, handleCompoundedTokenSymbol])

  React.useEffect(() => {
    if (!rewardsState.length) {
      handleRewards()
    }
  }, [rewardsState, handleRewards])

  React.useEffect(() => {
    if (tokenContract) {
      handleTokenState()
    }
  }, [tokenContract, handleTokenState])

  React.useEffect(() => {
    if (Object.values(tokenState).includes(null)) {
      return
    }
    handleFarmState()
  }, [tokenState, handleFarmState])

  React.useEffect(() => {
    if (!farmState.isInitialized) {
      return
    }

    const interval = setInterval(handleFarmState, 30000)

    return () => clearInterval(interval)
  }, [farmState.isInitialized, handleFarmState])

  const disableClaim = React.useMemo(
    () => {
      return false

      /* if (rewardsState.length === 0) {
      return true
    }

    return (
      rewardsState.filter((reward) => reward.availableTokenRewards > 0)
        .length === 0
    ) */
    },
    [
      /* rewardsState */
    ]
  )

  const earnings = React.useMemo(() => {
    const earningsAmount =
      farmState.stakedBalance && tokenState.tokensPerShare
        ? Number(farmState.stakedBalance) * Number(tokenState.tokensPerShare) -
          Number(farmState.stakedBalance)
        : 0

    return earningsAmount ? (
      <>
        <hr className="mt-2" />

        <div className="flex mt-2 justify-between">
          <strong>Earnings:</strong>
          <div className="text-right">
            <span>+{earningsAmount.toFixed(earningsAmount < 1 ? 6 : 2)} </span>
            <span>{compoundedTokenSymbol}</span>
          </div>
        </div>
      </>
    ) : null
  }, [
    farmState.stakedBalance,
    tokenState.tokensPerShare,
    compoundedTokenSymbol,
  ])

  const rewards = React.useMemo(() => {
    return rewardsState?.length ? (
      <DashboardCard.More>
        <strong className="mt-8">Current Reward(s):</strong>

        {rewardsState.map((reward) => (
          <div key={reward.address} className="flex justify-between">
            <div>{reward.availableTokenRewards || Number('0').toFixed(1)}</div>
            <div>{reward.symbol}</div>
          </div>
        ))}
      </DashboardCard.More>
    ) : null
  }, [rewardsState])

  const estimatedAPY = React.useMemo(() => {
    if (!horseysauce) {
      return 'UNABLE TO CALCULATE'
    }
    return `${horseysauce.cmUmamiBooster.totalApy}%`
  }, [horseysauce])

  const isLocked = React.useMemo(
    () => {
      return false

      /* if (!farmState.unlockTime) {
      return true
    }
    const currTime = new Date().getTime()
    const unlockTime = new Date(Number(farmState.unlockTime) * 1000).getTime()

    return unlockTime - currTime > 0 */
    },
    [
      /* farmState.unlockTime */
    ]
  )

  /* const lastDepositDisplay = React.useMemo(() => {
    const lastDepositTime =
      farmState.lastDepositTime !== null
        ? Number(farmState.lastDepositTime) * 1000
        : 0

    return farmState.lastDepositTime ? (
      <div className="flex uppercase justify-between items-center">
        <div>Last Deposit:</div>
        <div>{new Date(lastDepositTime).toLocaleDateString('en-us')}</div>
      </div>
    ) : null
  }, [farmState.lastDepositTime]) */

  return (
    <DashboardCard>
      <DashboardCard.Title>{farmName}</DashboardCard.Title>

      <DashboardCard.Subtitle>
        <span className="text-lg">
          <span className="font-extrabold">{estimatedAPY} APY</span>
          <span className="text-gray-500 font-light"> | </span>
        </span>
        <a
          href={`https://arbiscan.io/address/${farmAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 font-normal"
        >
          Contract
        </a>
      </DashboardCard.Subtitle>

      <DashboardCard.Content>
        <p className="mt-4">
          Step 2 of the mUMAMI Autocompounder is now inactive. Withdrawal fees
          and timelocks have been switched off and no further ARBIS rewards are
          being emitted.
        </p>

        <strong className="block mt-4">
          Please withdraw from Step 2 but stay in Step 1 to keep compounding!
        </strong>

        <div className="mt-8">
          <div className="flex justify-between">
            <strong>TVL:</strong>
            <div className="text-right">
              {Number(farmState.totalStaked) ? (
                <>
                  {parseFloat(String(farmState.totalStaked)).toLocaleString()}
                  <span> {tokenState.symbol}</span>
                </>
              ) : null}
            </div>
          </div>
          {earnings}
        </div>

        <div className="mt-4">
          <Selector>
            {['deposit', 'withdraw'].map((option) => (
              <Selector.Item
                key={option}
                text={option}
                onClick={() => setAction(option as 'deposit' | 'withdraw')}
                selected={option === action}
              />
            ))}
          </Selector>
        </div>

        {action === 'deposit' ? (
          <div className="mt-4">
            <Formik
              initialValues={{ depositAmount: '0' }}
              onSubmit={handleDeposit}
            >
              {({ isSubmitting, handleSubmit, setFieldValue, values }) => (
                <Form method="post">
                  <fieldset disabled={isSubmitting}>
                    <div>
                      <span>MAX: </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFieldValue(
                            'depositAmount',
                            Number(String(farmState.tokenBalance))
                          )
                        }
                        className="text-primary"
                      >
                        {Number(farmState.tokenBalance).toFixed(3)}
                      </button>
                      <span> {tokenState.symbol}</span>
                    </div>

                    <Field
                      name="depositAmount"
                      className="border mt-2 border-gray-300 p-4 rounded w-full"
                      disabled={isSubmitting}
                      type="number"
                    />

                    <div className="mt-4">
                      <DashboardCard.Action
                        onClick={
                          farmState.isApproved ? handleSubmit : handleApproval
                        }
                        color="white"
                        disabled={
                          !Number(values.depositAmount) &&
                          Boolean(farmState.isApproved)
                        }
                      >
                        {farmState.isApproved ? (
                          <>
                            {isSubmitting ? (
                              <span>staking...</span>
                            ) : (
                              <span>stake</span>
                            )}
                          </>
                        ) : (
                          <span>approve</span>
                        )}
                      </DashboardCard.Action>
                    </div>
                  </fieldset>
                </Form>
              )}
            </Formik>
          </div>
        ) : null}

        {action === 'withdraw' ? (
          <div className="mt-4">
            <Formik
              initialValues={{
                withdrawAmount: Number(farmState.stakedBalance),
              }}
              onSubmit={handleWithdraw}
            >
              {({ isSubmitting, handleSubmit, setFieldValue, values }) => (
                <Form method="post">
                  <fieldset disabled={isSubmitting}>
                    <div className="mt-2">
                      <span>ALL {tokenState.symbol} IS WITHDRAWN AT ONCE</span>
                    </div>
                    <Field
                      name="withdrawAmount"
                      className="border mt-2 border-gray-300 p-4 rounded w-full"
                      type="number"
                      disabled
                    />

                    <div className="mt-4">
                      <DashboardCard.Action
                        onClick={
                          farmState.isApproved ? handleSubmit : handleApproval
                        }
                        color="white"
                        disabled={
                          !Number(values.withdrawAmount) &&
                          Boolean(farmState.isApproved)
                        }
                      >
                        {farmState.isApproved ? (
                          <>
                            {isSubmitting ? (
                              <span>withdrawing...</span>
                            ) : (
                              <span>
                                {isLocked ? (
                                  <Countdown
                                    unlockTime={Number(farmState.unlockTime)}
                                  />
                                ) : (
                                  'withdraw'
                                )}
                              </span>
                            )}
                          </>
                        ) : (
                          <span>approve</span>
                        )}
                      </DashboardCard.Action>
                    </div>
                  </fieldset>
                </Form>
              )}
            </Formik>
          </div>
        ) : null}

        <div className="mt-4">
          <DashboardCard.Action
            color="black"
            disabled={disableClaim}
            onClick={handleClaim}
          >
            Claim Rewards
          </DashboardCard.Action>
        </div>
      </DashboardCard.Content>

      {rewards}
    </DashboardCard>
  )
}
