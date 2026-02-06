import { readFileSync, writeFileSync } from 'fs';

const path = './antigravity-accounts.json';
const data = JSON.parse(readFileSync(path, 'utf8'));

for (const acc of data.accounts) {
    acc.healthScore = 100;
    acc.consecutiveFailures = 0;
    acc.cooldowns = {};
    acc.modelScores = {};
    acc.history = [];
    acc.quota = [];
    delete acc.challenge;
}

writeFileSync(path, JSON.stringify(data, null, 2));
console.log("Reset all accounts successfully.");
