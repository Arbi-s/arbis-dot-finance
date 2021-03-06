import React from 'react'
import { formatEther, parseEther } from '@ethersproject/units'
import { BigNumber } from 'ethers'
import { Formik, Form, Field } from 'formik'

import DashboardCard from './DashboardCard'
import Selector from './Selector'

import useUserAddress from '../hooks/useUserAddress'
import useUserSigner from '../hooks/useUserSigner'
import useExternalContractLoader from '../hooks/useExternalContractLoader'
import useTransaction, { notify } from '../hooks/useTransaction'
import useGlobalState from '../hooks/useGlobalState'

import ERC20Abi from '../contracts/ERC20.abi'
import USDCETHStrategyAddress from '../contracts/USDCETHStrategy.address'

type Props = {
  farmName: string
  farmAddress: string
  farmAbi: any
}

export default function SushiFarm({ farmName, farmAddress, farmAbi }: Props) {
  const initState: {
    [k: string]: string | number | boolean | null
  } = {
    tokenBalance: null,
    tokenName: null,
    tokenSymbol: null,
    tokenTotalSupply: null,
    isApproved: false,
    farmReward: null,
    farmSymbol: null,
    farmTotalDeposits: null,
    farmTokensPerShare: null,
    farmUnderlyingTokensAvailable: null,
    farmShareBalance: null,
    isInitialized: false,
  }

  const [state, setState] = React.useState(initState)
  const [tokenAddr, setTokenAddr] = React.useState<string | null>(null)
  const [rewardTokenAddr, setRewardTokenAddr] = React.useState<string | null>(
    null
  )
  const [rewardSymbol, setRewardSymbol] = React.useState<string | null>(null)
  const [action, setAction] = React.useState<'deposit' | 'withdraw'>('deposit')

  const [{ horseysauce }] = useGlobalState()
  const userAddress = useUserAddress()
  const userSigner = useUserSigner()
  const transaction = useTransaction()
  const farmContract = useExternalContractLoader(farmAddress, farmAbi)
  const tokenContract = useExternalContractLoader(tokenAddr, ERC20Abi)
  const rewardContract = useExternalContractLoader(rewardTokenAddr, ERC20Abi)

  const totalValueStaked = React.useMemo(() => {
    if (!horseysauce) {
      return null
    }

    return (
      horseysauce.strategies.find((strat) => strat.address === farmAddress)
        ?.totalValueStaked || null
    )
  }, [horseysauce, farmAddress])

  const reward = React.useMemo(() => {
    if (!state.farmReward) {
      return '0'
    }

    const fixedNum = Number(state.farmReward).toFixed(6)

    return Number(fixedNum) / 200
  }, [state.farmReward])

  const handleTokenAddr = React.useCallback(async () => {
    if (!farmContract) {
      return
    }
    try {
      const [addr, rewardAddr] = await Promise.all([
        farmContract.depositToken(),
        farmAddress === USDCETHStrategyAddress
          ? farmContract.rewardToken()
          : farmContract.rewardToken1,
      ])
      setTokenAddr(addr)
      setRewardTokenAddr(rewardAddr)
    } catch (err) {
      console.log({
        err,
        callingFunc: 'handleTokenAddr',
        callingFarmName: farmName,
        state,
      })
    }
  }, [farmContract, state, farmName, farmAddress])

  const handleRewardSymbol = React.useCallback(async () => {
    if (!rewardContract || !rewardTokenAddr) {
      return null
    }
    try {
      const symbol = await rewardContract.symbol()
      setRewardSymbol(symbol)
    } catch (err) {
      console.log({
        err,
        callingFunc: 'handleRewardSymbol',
        callingFarmName: farmName,
      })
    }
  }, [rewardContract, farmName, rewardTokenAddr])

  const handleState = React.useCallback(async () => {
    if (!tokenAddr || !farmContract || !tokenContract || !userAddress) {
      return
    }
    try {
      const [
        tokenBalance,
        tokenName,
        tokenSymbol,
        tokenTotalSupply,
        approved,
        farmReward,
        farmSymbol,
        farmTotalDeposits,
        farmTokensPerShare,
        shareBalance,
      ] = await Promise.all([
        tokenContract.balanceOf(userAddress),
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.totalSupply(),
        tokenContract.allowance(userAddress, farmAddress),
        farmContract.checkReward(),
        farmContract.symbol(),
        farmContract.totalDeposits(),
        farmContract.getDepositTokensForShares(BigInt(1000000000000000000)),
        farmContract.balanceOf(userAddress),
      ])

      const farmUnderlyingTokensAvailable =
        await farmContract.getDepositTokensForShares(shareBalance || 0)
      const isApproved = !BigNumber.from('0').eq(approved)

      setState({
        tokenBalance: formatEther(tokenBalance),
        tokenName,
        tokenSymbol,
        tokenTotalSupply,
        isApproved,
        farmReward: formatEther(farmReward),
        farmSymbol,
        farmTotalDeposits: formatEther(farmTotalDeposits),
        farmTokensPerShare: formatEther(farmTokensPerShare),
        farmUnderlyingTokensAvailable: formatEther(
          farmUnderlyingTokensAvailable
        ),
        farmShareBalance: formatEther(shareBalance),
        isInitialized: true,
      })
    } catch (err) {
      console.log({
        err,
        callingFunc: 'handleState',
        callingFarmName: farmName,
      })
    }
  }, [
    farmAddress,
    tokenAddr,
    farmContract,
    tokenContract,
    userAddress,
    farmName,
  ])

  const handleDeposit = React.useCallback(
    async ({ depositAmount }, { resetForm }) => {
      if (!state.isApproved || !farmContract || !userSigner) {
        return
      }

      try {
        const amount = parseEther(String(Number(depositAmount)))
        const data = await farmContract.interface.encodeFunctionData(
          'deposit',
          [amount]
        )

        await transaction(
          userSigner.sendTransaction({ to: farmAddress, data } as any)
        )
      } catch (err) {
        notify.notification({
          eventCode: 'txError',
          type: 'error',
          message: (err as Error).message,
          autoDismiss: 10000,
        })
      }
    },
    [state.isApproved, farmContract, userSigner, transaction, farmAddress]
  )

  const handleWithdraw = React.useCallback(
    async ({ withdrawAmount }, { resetForm }) => {
      if (!state.isApproved || !farmContract || !userSigner) {
        return
      }

      try {
        const amount = parseEther(String(Number(withdrawAmount)))
        const data = await farmContract.interface.encodeFunctionData(
          'withdraw',
          [amount]
        )

        await transaction(
          userSigner.sendTransaction({ to: farmAddress, data } as any)
        )
      } catch (err) {
        notify.notification({
          eventCode: 'txError',
          type: 'error',
          message: (err as Error).message,
          autoDismiss: 10000,
        })
      }
    },
    [state.isApproved, farmContract, userSigner, transaction, farmAddress]
  )

  const handleApproval = React.useCallback(async () => {
    if (
      !userSigner ||
      !tokenContract ||
      !state.tokenTotalSupply ||
      !tokenAddr
    ) {
      return
    }

    try {
      const data = await tokenContract.interface.encodeFunctionData('approve', [
        farmAddress,
        state.tokenTotalSupply,
      ])

      await transaction(
        userSigner.sendTransaction({ to: tokenAddr, data } as any)
      )
    } catch (err) {
      notify.notification({
        eventCode: 'txError',
        type: 'error',
        message: (err as Error).message,
        autoDismiss: 10000,
      })
    }
  }, [userSigner, tokenContract, state, transaction, tokenAddr, farmAddress])

  const handleCompound = React.useCallback(async () => {
    if (!userSigner || !farmContract) {
      return
    }
    try {
      const data = await farmContract.reinvest()
      transaction(userSigner.sendTransaction({ to: farmAddress, data } as any))
    } catch (err) {
      notify.notification({
        eventCode: 'txError',
        type: 'error',
        message: (err as Error).message,
        autoDismiss: 10000,
      })
    }
  }, [userSigner, farmContract, transaction, farmAddress])

  React.useEffect(() => {
    if (tokenAddr === null) {
      handleTokenAddr()
    }
  }, [tokenAddr, handleTokenAddr])

  React.useEffect(() => {
    if (rewardSymbol === null) {
      handleRewardSymbol()
    }
  }, [rewardSymbol, handleRewardSymbol])

  React.useEffect(() => {
    if (!tokenAddr) {
      return
    }

    if (!state.isInitialized) {
      handleState()
    }
  }, [tokenAddr, state, handleState])

  React.useEffect(() => {
    if (!state.isInitialized) {
      return
    }

    const interval = setInterval(handleState, 30000)

    return () => clearInterval(interval)
  }, [state.isInitialized, handleState])

  const APY = React.useMemo(() => {
    if (!horseysauce) {
      return 0
    }
    const farmStrat = horseysauce.strategies.find(
      ({ address }) => address === farmAddress
    )
    return farmStrat ? farmStrat.apy : 0
  }, [horseysauce, farmAddress])

  return (
    <DashboardCard>
      <DashboardCard.Title>{farmName}</DashboardCard.Title>

      <DashboardCard.Subtitle>
        {APY ? (
          <>
            <span className="font-extrabold">{APY}% APY</span>
            <span className="text-gray-500 font-light"> | </span>
          </>
        ) : null}
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
          <span>
            Compound your rewards for your {state.tokenName} $
            {state.tokenSymbol} token for higher APY!
          </span>
        </p>

        <div className="mt-8">
          <div className="flex justify-between">
            <strong>TVL:</strong>
            <div className="text-right">
              {Number(state.farmTotalDeposits) ? (
                <>
                  ~
                  {parseFloat(String(state.farmTotalDeposits)).toLocaleString()}
                  <span> ${state.tokenSymbol}</span>
                </>
              ) : null}
              {Number(totalValueStaked) ? (
                <>
                  <span>
                    (${Number(totalValueStaked).toLocaleString('en-us')})
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <hr className="mt-2" />

          <div className="flex mt-2 justify-between">
            <strong>1 ${state.farmSymbol}:</strong>
            <div className="text-right">
              {Number(state.farmTokensPerShare).toFixed(3)} ${state.tokenSymbol}
            </div>
          </div>
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
                            Number(state.tokenBalance)
                          )
                        }
                        className="text-primary"
                      >
                        {Number(state.tokenBalance).toFixed(3)}
                      </button>
                      <span> ${state.tokenSymbol}</span>
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
                          state.isApproved ? handleSubmit : handleApproval
                        }
                        color="white"
                        disabled={
                          !Number(values.depositAmount) &&
                          Boolean(state.isApproved)
                        }
                      >
                        {state.isApproved ? (
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
              initialValues={{ withdrawAmount: '0' }}
              onSubmit={handleWithdraw}
            >
              {({ isSubmitting, handleSubmit, setFieldValue, values }) => (
                <Form method="post">
                  <div>
                    <span>MAX: </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFieldValue(
                          'withdrawAmount',
                          Number(state.farmShareBalance)
                        )
                      }
                      className="text-primary"
                    >
                      {Number(state.farmShareBalance).toFixed(3)}
                    </button>
                    <span> ${state.farmSymbol}</span>
                  </div>

                  <div>
                    <span>GET BACK: </span>
                    <span>
                      {state.farmUnderlyingTokensAvailable} ${state.tokenSymbol}
                    </span>
                  </div>

                  <Field
                    name="withdrawAmount"
                    className="border mt-2 border-gray-300 p-4 rounded w-full"
                    disabled={isSubmitting}
                    type="number"
                  />

                  <div className="mt-4">
                    <DashboardCard.Action
                      onClick={state.isApproved ? handleSubmit : handleApproval}
                      color="white"
                      disabled={
                        !Number(values.withdrawAmount) &&
                        Boolean(state.isApproved)
                      }
                    >
                      {state.isApproved ? (
                        <>
                          {isSubmitting ? (
                            <span>withdrawing...</span>
                          ) : (
                            <span>withdraw</span>
                          )}
                        </>
                      ) : (
                        <span>approve</span>
                      )}
                    </DashboardCard.Action>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        ) : null}

        <div className="mt-4">
          <DashboardCard.Action
            color="black"
            disabled={!Number(state.farmReward)}
            onClick={() => handleCompound()}
          >
            Compound
          </DashboardCard.Action>
        </div>
      </DashboardCard.Content>

      <DashboardCard.More>
        <strong>Current Reward(s):</strong>

        <div className="flex justify-between">
          <div>{reward}</div>
          <div>{rewardSymbol}</div>
        </div>
      </DashboardCard.More>
    </DashboardCard>
  )
}
