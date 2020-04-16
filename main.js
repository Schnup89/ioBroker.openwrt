"use strict";

/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const request = require("request");

let sPass = "";
// Load your modules here, e.g.:
// const fs = require("fs");

class Openwrt extends utils.Adapter {

    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        // @ts-ignore
        super({
            ...options,
            name: "openwrt",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("objectChange", this.onObjectChange.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    decrypt(key, value) {
        let result = "";
        for (let i = 0; i < value.length; ++i) {
            result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
        }
        this.log.debug("client_secret decrypt ready");
        return result;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.log.info("##### ADAPTER starting #####");
        //Get encrypted Password
        this.getForeignObject("system.config", (err, obj) => {
            if (obj && obj.native && obj.native.secret) {
                //noinspection JSUnresolvedVariable
                // @ts-ignore
                sPass = this.decrypt(obj.native.secret, this.config.pwd);
            } else {
                //noinspection JSUnresolvedVariable
                // @ts-ignore
                sPass = this.decrypt("Zgfr56gFe87jJOM", this.config.pwd);
            }

            // Start Timer here

            this.log.info("Loaded encrypted Password!");

            this.fHTTPGetToken();
        });
    
        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);

        this.subscribeStates("*");

    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info("cleaned everything up...");
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.message" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    // 	if (typeof obj === "object" && obj.message) {
    // 		if (obj.command === "send") {
    // 			// e.g. send email or pushover or whatever
    // 			this.log.info("send command");

    // 			// Send response in callback if required
    // 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
    // 		}
    // 	}
    // }

    fValidateHTTPResult(error, response, sFuncName) {
        if (error) {
            this.log.warn("##### fHTTP" + sFuncName + " ERROR: " + error.toString());
            return false;  //Error
        } else {
            if (!(response.statusCode == 200)) {
                this.log.info("##### fHTTP" + sFuncName + " HTTPCode: " + response.statusCode);
            } 
        }

        return true;  //NO Error
    }

    fHTTPGetToken(){
        const oReqBody = {
            "id": 1,
            "method": "login",
            "params": ["root",sPass]
        };
        const oReqOpt = {
            "method": "GET",
            "url": "http://192.168.10.1/cgi-bin/luci/rpc/auth",
            "headers": { "Content-Type": ["application/json", "text/plain"] },
            "body": JSON.stringify(oReqBody)            
        };  

        this.log.info("HTTPRequest getToken");
        request(oReqOpt, (error, response, body) => {
            if (this.fValidateHTTPResult(error,response,"GetToken")) {
                const oBody = JSON.parse(body);
                if (!oBody.error && oBody.result) {
                    this.log.info("Token: " + oBody.result);
                    this.config.option1
                }else{
                    this.log.info("##### fHTTPRequest ResultError: " + body);
                }
            }
        });
    }

    fHTTPGetUptime() {
        const oReqBody = {
            "method": "uptime"
        };
        const oReqOpt = {
            "method": "POST",
            // @ts-ignore
            "url": "http://192.168.10.1/cgi-bin/luci/rpc/sys?auth="+this.config.sToken,
            "headers": {
                "Content-Type": ["application/json", "text/plain"]
            },
            "body": JSON.stringify(oReqBody)            
        };

        this.log.info("HTTPRequest GetUptime");
        request(sReqOpt, (error, response, body) => {
          
            
            this.log.info("HTTP-Code: " + response.statusCode);
            this.log.info("Body: " + body);
        });

    }
}



// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Openwrt(options);
} else {
    // otherwise start the instance directly
    new Openwrt();
}
