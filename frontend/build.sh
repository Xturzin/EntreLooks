#!/bin/sh
echo "const CONFIG = { API_URL: '${API_URL}' };" > js/config.js
echo "config.js gerado com API_URL=${API_URL}"