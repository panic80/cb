#!/bin/bash

# Script to ingest NJC meal rates into the RAG service

echo "Ingesting NJC meal rates from National Joint Council website..."

# NJC meal rates URL
NJC_URL="https://www.njc-cnm.gc.ca/directive/d10/v238/en"

# RAG service endpoint
RAG_SERVICE_URL="http://localhost:8000/api/v1/ingest"

# Make the ingestion request
curl -X POST "${RAG_SERVICE_URL}" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${NJC_URL}\",
    \"type\": \"web\",
    \"metadata\": {
      \"source\": \"NJC\",
      \"category\": \"meal_rates\",
      \"tags\": [\"meal_rates\", \"per_diem\", \"allowances\", \"njc\"]
    },
    \"force_refresh\": true
  }"

echo -e "\n\nIngestion request sent. The RAG service will process the NJC meal rates page."
echo "This page contains the correct meal rates including:"
echo "- Yukon lunch rate: \$25.65"
echo -e "\nAfter ingestion completes, clear the cache to ensure new rates are used."