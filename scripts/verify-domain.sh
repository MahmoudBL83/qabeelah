#!/usr/bin/env bash
API_BASE=${API_BASE:-http://localhost:4000/api}
TENANT_ID=$1
if [ -z "$TENANT_ID" ]; then
  echo "Usage: ./verify-domain.sh <tenantId>"
  exit 1
fi
TOKEN_JSON=$(curl -s -X POST -H "Authorization: Bearer $QABILA_TOKEN" "$API_BASE/tenants/$TENANT_ID/domain/verify/start")
TOKEN=$(echo "$TOKEN_JSON" | jq -r .token)
INSTR=$(echo "$TOKEN_JSON" | jq -r .instructions)
echo "Token: $TOKEN"
echo "Instructions: $INSTR"

echo "After adding the TXT or HTTP file, confirm via DNS:"
curl -s -X POST -H "Authorization: Bearer $QABILA_TOKEN" -H "Content-Type: application/json" -d '{"method":"dns"}' "$API_BASE/tenants/$TENANT_ID/domain/verify/confirm" | jq
