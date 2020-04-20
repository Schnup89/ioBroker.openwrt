"use strict";

/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const request = require("request");
const type = require("get-type");

// eslint-disable-next-line no-unused-vars
let tmr_GetValues = null;

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
        //this.on("objectChange", this.onObjectChange.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("message", this.onMessage.bind(this));
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

    replaceAll(str, find, replace) {
        return str.replace(new RegExp(find, "g"), replace);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        let bPreCheckErr = false;   //We can't stop the adapter since we need it 4 url and auth check. Make preCheck, if error found don't run main functions 

        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);

        this.log.info("##### LOAD CONFIG #####");
        
        //Check refresh interval field, if its's not set, we set it
        if (!Number.isInteger(this.config.inp_refresh)) {
            this.config.inp_refresh = 5;
            this.log.info("Update-Interval overwritten to: " + this.config.inp_refresh.toString());
            //bPreCheckErr = true;   If this is not defined we do it! Dont stop :)
        }
        //Check path field, if it's not set, we dont run
        if (this.config.inp_url.length == 0) {
            this.log.info("## URL emtpy, only Path-Check available");
            bPreCheckErr = true;  //Dont run
        }
        //Check user field, if it's not set, we dont run
        if (this.config.inp_username.length == 0) {
            this.log.info("## User emtpy, only Path-Check available");
            bPreCheckErr = true;  //Dont run
        }

        //Get encrypted Password
        const oConf = await this.getForeignObjectAsync("system.config");
        if (oConf && oConf.native && oConf.native.secret) {
            // @ts-ignore
            sPass = this.decrypt(oConf.native.secret, this.config.inp_password);
        } else {
            sPass = this.decrypt("Zgfr56gFe87jJOM", this.config.inp_password);
        }
        this.log.info("Decrypted the encrypted password!");

        
        this.log.info("##### RUN ADAPTER ##### ");
        if (!bPreCheckErr) {
            //Get first Time Token
            await this.fHTTPGetToken();
            //Then begin Update Timer
            this.fHTTPGetValues();
        } else {
            this.log.info("##### PRE CHECK ERRORS, MAIN FUNCTIONS DISABLED! Check Settings");
        }
        
        this.setObjectNotExists("sendCommand", {
            type: "state",
            common: { name: "sendCommand", type: "text", role: "text", write: true},
            native: {}  
        });
        this.setState("sendCommand", "");

        this.subscribeStates("*");

    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if (tmr_GetValues) {
                clearInterval(tmr_GetValues);
                tmr_GetValues = null;
            }
            this.log.info("cleaned everything up...");
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
    // * Is called if a subscribed object changes
    // * @param {string} id
    // * @param {ioBroker.Object | null | undefined} obj
    */

    /*onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }*/

    /**
    //  * Is called if a subscribed state changes
    // * @param {string} id
    //* @param {ioBroker.State | null | undefined} state
    */

    onStateChange(id, state) {
        if (state) {
            // The state was changed
            if (state.id == "sendCommand" && state.val) { //& value not "" empty 
                this.log.info("SendCommand: " + state.val);
            }
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
    async onMessage(obj) {
        if (typeof obj === "object") {
            //Check if URL Reachable
            if (obj.command === "checkURL") {
                //save Command Result true/false
                const bCheckRes = await this.fHTTPCheckURL(obj.message);
                //send Result back
                if (obj.callback) this.sendTo(obj.from, obj.command, bCheckRes.toString(), obj.callback);
            }

            //Check if AUTH OK
            if (obj.command === "checkAuth") {
                //save Command Result true/false
                const bCheckRes = await this.fHTTPCheckAuth(obj.message);
                //send Result back
                if (obj.callback) this.sendTo(obj.from, obj.command, bCheckRes.toString(), obj.callback);
            }
        }
    }

    fHTTPCheckURL(oCheckVals) {
        return new Promise((resolve) => {
            const oReqOpt = {
                "method": "GET",
                "url": oCheckVals.sURL + "auth"         
            };  

            this.log.info("Called fHTTPCheckURL");
            request(oReqOpt, (error, response, body) => {
                try {
                    if (error) {
                        this.log.warn("fHTTPCheckURL Unexpected Error: " + error);
                        resolve(false);
                    } else { 
                        if (!body.includes("jsonrpc")) {
                            this.log.warn("fHTTPCheckURL 'jsonrpc' not found in response.");
                            resolve(false);
                        } else {
                            this.log.info("fHTTPCheckURL success");
                            resolve(true);
                        }
                    }
                } catch (e) {
                    this.log.info("##### fHTTPCheckURL CatchError: " + e);
                }
            });
        });
    }

    fHTTPCheckAuth(oCheckVals) {
        return new Promise((resolve) => {
            const oReqBody = {
                "id": 1,
                "method": "login",
                "params": [oCheckVals.sUser,oCheckVals.sPass]
            };
            const oReqOpt = {
                "method": "GET",
                "url": oCheckVals.sURL + "auth",
                "headers": { "Content-Type": ["application/json", "text/plain"] },
                "body": JSON.stringify(oReqBody)            
            };   
            this.log.info("Called fHTTPCheckAuth");
            request(oReqOpt, (error, response, body) => {
                try {
                    if (this.fValidateHTTPResult(error,response,"CheckAuth")) {
                        const oBody = JSON.parse(body);
                        if (!oBody.error && oBody.result) {
                            this.log.info("fHTTPCheckAuth success");
                            resolve(true);
                        }else{
                            this.log.info("fHTTPCheckAuth ResultError: " + body);
                            resolve(false);
                        }
                    } else {
                        //Log Message printed in fValidateHTTPResult function
                        resolve(false);
                    }
                    resolve(true);
                } catch (e) {
                    this.log.info("##### fHTTPCheckAuth CatchError: " + e);
                }
            });
        });
    }


    async fValidateHTTPResult(error, response, sFuncName) {
        if (error) {
            this.log.warn("##### fHTTP" + sFuncName + " ERROR: " + error.toString());
            return false;  //Error
        } else {
            if (!(response.statusCode == 200)) {
                this.log.info("##### fHTTP" + sFuncName + " HTTPCode: " + response.statusCode);
                if (response.statusCode == 403) {
                    await this.fHTTPGetToken();
                }
                return false;  //Error
            } 
        }

        return true;  //NO Error
    }

    fHTTPGetToken() {  //NOT ASYNC 
        return new Promise((resolve) => {
            const oReqBody = {
                "id": 1,
                "method": "login",
                "params": ["root",sPass]
            };
            const oReqOpt = {
                "method": "GET",
                "url": this.config.inp_url + "auth",
                "headers": { "Content-Type": ["application/json", "text/plain"] },
                "body": JSON.stringify(oReqBody)            
            };  

            this.log.info("Called fHTTGetToken");
            request(oReqOpt, (error, response, body) => {
                if (this.fValidateHTTPResult(error,response,"GetToken")) {
                    try {
                        const oBody = JSON.parse(body);
                        if (!oBody.error && oBody.result) {
                            this.log.info("Saved new Token: " + oBody.result);
                            this.config.sToken =  oBody.result;
                            this.setState("info.connection",true,true);
                        }else{
                            this.log.info("##### fHTTPGetToken ResultError: " + body);
                            this.setState("info.connection",false,true);
                        }
                    } catch (e) {
                        this.log.info("##### fHTTPGetToken CatchError: " + e);
                        this.setState("info.connection",false,true);
                    }
                } else { 
                    //Error Message is printed in validate function
                    this.setState("info.connection",false,true);
                }
                resolve(true);
            });
        });
    }

    fHTTPGetValues() {
        //Set Timer for next Update
        tmr_GetValues = setTimeout(() =>this.fHTTPGetValues(),this.config.inp_refresh * 60000);

        for (let nEntry = 0; nEntry < this.config.list_commands.length; nEntry++) {
            this.fHTTPGetUbusCMD(this.config.list_commands[nEntry].cmd);
        }
    }

    // eslint-disable-next-line no-unused-vars
    fOverrideExists(sKey) {
        const sType = "";
        const sRole = "";
        //ToDo, check if Override exists, change const to let and overrite it!
        return { name: "", type: sType, role: sRole, read: true, write: false };
    }


    //##################### DATA FUNCTION

    fSetValue2State(oValue, oKey, sFolder, oTree){
        // eslint-disable-next-line prefer-const
        let oCommon = this.fOverrideExists(oKey);
        oCommon.name = oKey;
        
        //this.log.info(oKey + ": " + type.get(oValue));
        if (oCommon.type == "") { //NOT Overwritten
            switch(type.get(oValue)) {
                case "string":
                    oCommon.type = "text"; 
                    oCommon.role =  "text";
                    oCommon.write = false;
                    break;
                case "number":
                    oCommon.type = "number"; 
                    oCommon.role =  "value";
                    oCommon.write = false;
                    break;
                case "boolean":
                    oCommon.type = "boolean"; 
                    oCommon.role =  "inidicator";
                    oCommon.write = false;
                    break;
                case "array":
                    if (Object.entries(oTree[oKey]).length) {    
                        for (const [key, value] of Object.entries(oTree[oKey])) {
                            oValue = oValue + ", "+ value;
                            this.fSetValue2State(value,key,sFolder+"."+oKey,oTree[oKey]);
                        }      
                        oValue.slice(-1);
                    }
                    return; //No need to set this Parent Object
                case "object":
                    if (Object.entries(oTree[oKey]).length) {
                        for (const [key, value] of Object.entries(oTree[oKey])) {
                            oValue = oValue + ", "+ value;
                            this.fSetValue2State(value,key,sFolder+"."+oKey,oTree[oKey]);
                        }   
                        oValue.slice(-1); 
                    }  
                    return; //No need to set this Parent Object
                default:
                    this.log.warn("Unhandled DataType: " + type.get(oValue) + " for " + oKey);
                    return;  // Do Nothing
            }
        }
        this.setObjectNotExists(sFolder + "." + oCommon.name, {
            type: "state",
            common: oCommon,
            native: {}  
        });
        this.setState(sFolder + "." + oCommon.name, oValue);
    }



    fHTTPGetUbusCMD(sCMD) {  //ubus Communication
        const oReqBody = {
            "method": "exec",
            "params": [ sCMD ]
        };
        const oReqOpt = {
            "method": "POST",
            "url": this.config.inp_url + "sys?auth="+this.config.sToken,
            "headers": {
                "Content-Type": ["application/json", "text/plain"]
            },
            "body": JSON.stringify(oReqBody)            
        };

        request(oReqOpt, async (error, response, body) => {
            if (await this.fValidateHTTPResult(error,response,"GetUbusCMD, " + sCMD)) {
                try {
                    //bug... output \n\t\ seems broken, delete it
                    body = this.replaceAll(body,"\n\t","");
                    const oBody = JSON.parse(body);
                    if (!oBody.error && oBody.result) {
                        const oTree = JSON.parse(oBody.result);
                        for (const [key, value] of Object.entries(oTree)) { 
                            let sFolder = this.replaceAll(sCMD," ","_");     //Format CMD  to be OK as ObjectName
                            sFolder = this.replaceAll(sFolder ,/\./,"-");  //Format CMD to be OK as ObjectName
                            this.fSetValue2State(value,key,sFolder, oTree);
                        }                          
                    }
                } catch (e) {
                    this.log.info("##### GetUbusCMD, " + sCMD + " + CatchError: " + e);
                }
            }
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
