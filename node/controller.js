/* 
Copyright (c) 2012 Pablo Duboue

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.  
*/

var crypto = require('crypto');

// check sha512 is available
crypto.createHash("sha512");

function Controller(cache, docfetcher){
    this.cache = cache;
    this.docfetcher = docfetcher;
    setInterval(function(){
        cache.heartbeat();
    }, 500);
    setInterval(function(){
        docfetcher.heartbeat();
    }, 3000);
}

function message(connection_id, message){
    var self=this;
    if(message.type === "binary"){
        // document, compute SHA256
        process.nextTick(function(){
            sha256 = crypto.createHash("sha256");
            sha256.update(message.binaryData.toString('utf8'));
            hash = sha256.digest("hex");
            console.log("Hash: "+hash);
            self.cache.validate(connection_id, hash);
            process.nextTick(function(){
                self.docfetcher.received(hash, message.binaryData);
            });
        });
    }else if(message.type === "utf8"){
        // JSON, parse it
        var json;
        try{
            json = JSON.parse(message.utf8Data);
        }catch(err){
            return console.error(err);
        }
        // analyze JSON object and execute
        if('command' in json){
            if(json.command === 'FETCH') {
                if(!('hash' in json))
                    return console.error('FETCH without hash: '+message.utf8Data);
                this.docfetcher.fetch(json.hash, connection_id);
            }else if(json.command === 'REGISTER') {
                if(!('hash' in json))
                    return console.error('REGISTER without hash: '+message.utf8Data);
                this.cache.validate(connection_id, json.hash)
            }else if(json.command === 'AVAILABLE') {
                if(!('number_of_slots' in json))
                    return console.error('AVAILABLE without number_of_slots: '+message.utf8Data);
                this.cache.capacity(connection_id, json.number_of_slots);
            }else if(json.command === 'LIST') {
                if(!('number_of_hashes' in json))
                    return console.error('LIST without number_of_hashes: '+message.utf8Data);
                var message = JSON.stringify({ 'response' : 'LIST', 'hashes': cache.list(json.number_of_hashes) });
                process.nextTick(function(){
                    self.conmgr.send(connection_id, message);
                });
            }else{
                return console.error('Unknown command ' + json.command);
            }
        }else if('response' in json){
            if(json.response === 'UNAVAILABLE'){
                if(!('hash' in json))
                    return console.error('UNAVAILABLE without hash: '+message.utf8Data);
                this.cache.invalidate(connection_id, hash);
                this.docfetcher.not_found(connection_id, hash);
            }else{
                return console.error('Unknown response ' + json.response);
            }
        }
    }else{
        return console.error("Unknown message type: '" + message.type + "'");
    }
}

function status(){
    var result = this.cache.info();
    result.max_document_size = this.docfetcher.max_doc_size;
    return JSON.stringify(result);
}

Controller.prototype.message = message;
Controller.prototype.status = status;
module.exports = Controller;