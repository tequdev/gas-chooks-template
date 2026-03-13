import {
  SetHookFlags,
  type SubmittableTransaction,
  type Wallet,
  calculateHookOn,
} from 'xahau'
import { getFeeEstimateXrp } from 'xahau/dist/npm/sugar/getFeeXah'
import {
  serverUrl,
  type XrplIntegrationTestContext,
  setupClient,
  teardownClient,
} from '@transia/hooks-toolkit/dist/npm/src/libs/xrpl-helpers'

import {
  type SetHookParams,
  setHooksV3,
  hexNamespace,
  type iHook,
  readHookBinaryHexFromNS,
  clearAllHooksV3,
  clearHookStateV3,
  Xrpld,
} from '@transia/hooks-toolkit'
import {
  coreTypes,
  encode,
  encodeForSigning,
  XrplDefinitions,
} from 'xahau-binary-codec'
import type { DefinitionsData } from 'xahau-binary-codec/dist/enums/xahau-definitions-base'
import { sign } from 'xahau-keypairs'

const namespace = 'namespace'

describe('test', () => {
  let testContext: XrplIntegrationTestContext
  let definitions: XrplDefinitions

  beforeAll(async () => {
    testContext = await setupClient(serverUrl)
    const hook = {
      CreateCode: readHookBinaryHexFromNS('../build/index', 'wasm'),
      Flags: SetHookFlags.hsfOverride,
      HookOn: calculateHookOn(['Invoke']),
      HookNamespace: hexNamespace(namespace),
      HookApiVersion: 1,
    } as iHook
    await setHooksV3({
      client: testContext.client,
      wallet: testContext.alice,
      hooks: [{ Hook: hook }],
    } as SetHookParams)
    const response = await testContext.client.request({
      command: 'server_definitions',
    })
    definitions = new XrplDefinitions(
      response.result as DefinitionsData,
      coreTypes,
    )
  })

  afterAll(async () => {
    const clearHook = {
      Flags: SetHookFlags.hsfNSDelete,
      HookNamespace: hexNamespace(namespace),
    } as iHook
    await clearHookStateV3({
      client: testContext.client,
      wallet: testContext.alice,
      hooks: [{ Hook: clearHook }],
    } as SetHookParams)
    await clearAllHooksV3({
      client: testContext.client,
      wallet: testContext.alice,
    } as SetHookParams)
    await teardownClient(testContext)
  })

  const autofill = async (tx: SubmittableTransaction, hookGas: number) => {
    let returnTx
    returnTx = await testContext.client.autofill(tx)
    returnTx.SigningPubKey = ''
    returnTx.HookGas = hookGas
    const fee = await getFeeEstimateXrp(
      testContext.client,
      encode(returnTx, definitions),
    )
    returnTx.Fee = fee
    return returnTx
  }

  const signTransaction = (tx: SubmittableTransaction, wallet: Wallet) => {
    tx.SigningPubKey = wallet.publicKey
    tx.TxnSignature = sign(encodeForSigning(tx, definitions), wallet.privateKey)
    return tx
  }

  const signAndSubmit = async (
    tx: SubmittableTransaction,
    hookGas: number,
    wallet: Wallet,
  ) => {
    let returnTx: any
    returnTx = await autofill(tx, hookGas)
    returnTx = signTransaction(returnTx, wallet)
    const submitResponse = await testContext.client.request({
      command: 'submit',
      tx_blob: encode(returnTx, definitions),
    })
    await testContext.client.request({ command: 'ledger_accept' })
    const response = await testContext.client.request({
      command: 'tx',
      transaction: submitResponse.result.tx_json.hash,
    })
    return response.result
  }

  it('Test Gas hook', async () => {
    const tx: SubmittableTransaction = {
      TransactionType: 'Invoke',
      Account: testContext.alice.address,
      Fee: '0',
    }
    const response = await signAndSubmit(tx, 10000, testContext.alice)

    console.log(response.meta)
    expect(response.meta).toHaveProperty('HookExecutions')
  })
})
