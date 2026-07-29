const fs = require('fs')
const crypto = require("crypto");

let card = JSON.parse(fs.readFileSync("NFT_0.json"))
console.table(card)
card_total = card.length
for (i = 0; i < card_total; i++) {
    pwd = card[i].name
    card[i].nft = crypto.createHash("sha256").update(pwd).digest("hex").toUpperCase();
    card[i].percent = card[i].population/140000
    card[i].price = 1000    
}
console.table(card)
fs.writeFileSync( "NFT_card.json", JSON.stringify(card))
let log = []
for (i = 0; i < card_total; i++) {
    log[i] = []
    thread = 1
    time = "2025/1/22 10:31:38"
    price = 1000.00
    seller = "创始"
    buyer =  "10001.1000.1010"
    chain = card[i].nft
    pwd = thread + time + price + seller + buyer + chain
    next_chain = crypto.createHash("sha256").update(pwd).digest("hex").toUpperCase();
    log[i][0] = {thread, time, price, seller, buyer, chain, next_chain}

    card[i].source = "..."
    card[i].distribution = "..."
    card[i].history = "..."
    card[i].modern = "..."
    card[i].log = log[i]
    // 删除price字段
    delete card[i].price
    filename = "name_for_json/"+card[i].name+".json"
    fs.writeFileSync(filename, JSON.stringify(card[i]))
console.table(log[i])
}
    
