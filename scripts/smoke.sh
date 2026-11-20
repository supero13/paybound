#!/usr/bin/env bash
# End-to-end smoke test on Aevum 44005 using the deployer wallet (keys from gitignored .env files).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; . ./.env.payee; set +a
R=${AEVUM_RPC_URL:-https://rpc-test.qday.info}
T=0x456569838f1d43009A91ebA4263147Afd7233483
V=0xB332eea4bBb9CA78371C63BccB0B5b50C213383E
G=0x5942f4Ce67411cF4AE1d794535Ebdf9374E7659a
ME=$DEPLOYER_ADDRESS
send() { cast send --legacy --rpc-url "$R" --private-key "$DEPLOYER_PRIVATE_KEY" --json "$@" | python3 -c 'import sys,json;r=json.load(sys.stdin);print(r["transactionHash"], "status", int(r["status"],16), "block", int(r["blockNumber"],16), "gas", int(r["gasUsed"],16))'; }
echo "approve 0.5";   send $T "approve(address,uint256)" $V 500000
echo "deposit 0.5";   send $V "deposit(uint256)" 500000
echo "addPayee";      send $G "addPayee(string,address)" "Smoke Payee" $PAYEE_ADDRESS
ID=$(cast call $G "activePayeeIdOf(address,address)(uint256)" $ME $PAYEE_ADDRESS --rpc-url $R)
echo "payeeId $ID; confirmPayee"; send $G "confirmPayee(uint256,address)" $ID $PAYEE_ADDRESS
EXP=$(( $(date +%s) + 30*86400 ))
echo "setPayeeLimit 0.25/tx 0.5/day"; send $V "setPayeeLimit(uint256,uint128,uint128,uint64,uint64)" $ID 250000 500000 86400 $EXP
echo "preview 0.30 (expect blocker 7 OverPayeeTxCap):"; cast call $V "previewPayment(address,address,uint256,uint256)(uint8,address)" $ME $ME $ID 300000 --rpc-url $R
echo "preview 0.10 (expect 0):"; cast call $V "previewPayment(address,address,uint256,uint256)(uint8,address)" $ME $ME $ID 100000 --rpc-url $R
REF=$(cast keccak "smoke-test-1")
echo "pay 0.1";       send $V "pay(address,uint256,uint256,bytes32,string)" $ME $ID 100000 $REF "Week 2 smoke test"
echo "payee tUSD8: $(cast call $T 'balanceOf(address)(uint256)' $PAYEE_ADDRESS --rpc-url $R)"
echo "vault bal:   $(cast call $V 'balanceOf(address)(uint256)' $ME --rpc-url $R)"
echo "remaining:   $(cast call $V 'remainingForPayee(address,uint256)(uint256)' $ME $ID --rpc-url $R)"
echo "receipts:    $(cast call $V 'receiptCount()(uint256)' --rpc-url $R)"
echo "tQDAY left:  $(cast balance $ME --ether --rpc-url $R)"
