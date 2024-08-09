--[[
   Author: Julio Manuel Fernandez-Diaz
   Date:   January 12, 2007
   (For Lua 5.1)

   Modified slightly by RiciLake to avoid the unnecessary table traversal in tablecount()

   Formats tables with cycles recursively to any depth.
   The output is returned as a string.
   References to other tables are shown as values.
   Self references are indicated.

   The string returned is "Lua code", which can be procesed
   (in the case in which indent is composed by spaces or "--").
   Userdata and function keys and values are shown as strings,
   which logically are exactly not equivalent to the original code.

   This routine can serve for pretty formating tables with
   proper indentations, apart from printing them:

      print(table.show(t, "t"))   -- a typical use

   Heavily based on "Saving tables with cycles", PIL2, p. 113.

   Arguments:
      t is the table.
      name is the name of the table (optional)
      indent is a first indentation (optional).
--]]
function table.show(t, name, indent)
    local cart -- a container
    local autoref -- for self references

    --[[ counts the number of elements in a table
    local function tablecount(t)
       local n = 0
       for _, _ in pairs(t) do n = n+1 end
       return n
    end
    ]]
    -- (RiciLake) returns true if the table is empty
    local function isEmptyTable(tab) return next(tab) == nil end

    local function basicSerialize(o)
        local so = tostring(o)
        if type(o) == "function" then
            local info = debug.getinfo(o, "S")
            -- info.name is nil because o is not a calling level
            if info.what == "C" then
                return string.format("%q", so .. ", C function")
            else
                -- the information is defined through lines
                return string.format("%q", so .. ", defined in (" ..
                        info.linedefined .. "-" .. info.lastlinedefined ..
                        ")" .. info.source)
            end
        elseif type(o) == "number" or type(o) == "boolean" then
            return so
        else
            return string.format("%q", so)
        end
    end

    local function addToCart(value, name, indent, saved, field)
        indent = indent or ""
        saved = saved or {}
        field = field or name

        cart = cart .. indent .. field

        if type(value) ~= "table" then
            cart = cart .. " = " .. basicSerialize(value) .. ";\n"
        else
            if saved[value] then
                cart = cart .. " = {}; -- " .. saved[value]
                        .. " (self reference)\n"
                autoref = autoref .. name .. " = " .. saved[value] .. ";\n"
            else
                saved[value] = name
                --if tablecount(value) == 0 then
                if isEmptyTable(value) then
                    cart = cart .. " = {};\n"
                else
                    cart = cart .. " = {\n"
                    for k, v in pairs(value) do
                        k = basicSerialize(k)
                        local fname = string.format("%s[%s]", name, k)
                        field = string.format("[%s]", k)
                        -- three spaces between levels
                        addToCart(v, fname, indent .. "   ", saved, field)
                    end
                    cart = cart .. indent .. "};\n"
                end
            end
        end
    end

    name = name or "__unnamed__"
    if type(t) ~= "table" then
        return name .. " = " .. basicSerialize(t)
    end
    cart, autoref = "", ""
    addToCart(t, name, indent)
    return cart .. autoref
end



server = {}

rs = RepetierServer()
cloud = RepetierCloud()
settings = ServerSettings()
server.responseInspectors = {}
server.actionInspectors = {}
server.frontendCSSFiles = {}
server.frontendJSFiles = {}
server.frontendModules = {}
server.eventListener = {}
server.runAtStartup = {}
server.dynRequests = {}
server.languageDetectors = {}
server.cloudServices = {}
server.serverCommands = {}

function server:registerLanguageDetector(f)
    self.languageDetectors[#self.languageDetectors] = f
end

function server:registerAction(action, f)
    self.actionInspectors[action] = f
end

function server:registerServerCommand(command, f)
    command = command:lower()
    if (self.serverCommands[command] == nil) then
        self.serverCommands[command] = {}
    end
    self.serverCommands[command][#self.serverCommands[command] + 1] = f
end

function server:registerCloudService(description)
    self.cloudServices[#self.cloudServices] = description
end

function server:registerResponseHandler(f)
    self.responseInspectors[#self.responseInspectors + 1] = f
end

function server:registerFrontendCSS(css)
    self.frontendCSSFiles[#self.frontendCSSFiles + 1] = css
end

function server:registerFrontendJS(js)
    self.frontendJSFiles[#self.frontendJSFiles + 1] = js
end

function server:registerFrontendModule(module)
    self.frontendModules[#self.frontendModules + 1] = module
end

function server:registerRunAtStartup(f)
    self.runAtStartup[#self.runAtStartup + 1] = f
end

function server:registerEventHandler(event, f)
    if (self.eventListener[event] == nil) then
        self.eventListener[event] = {}
    end
    self.eventListener[event][#self.eventListener[event] + 1] = f
end

function server:registerDynRequest(segment, f)
    self.dynRequests[segment] = f
end

-- Handle server responses
server.analyzeResponse = function(printer, line, rtype)
    for _, f in pairs(server.responseInspectors) do
        tmp = f(printer, line, rtype)
        if tmp then
            rtype = tmp
        end
    end
    return rtype
end

-- Calls all functions register for single run at startup
server.handleRunAtStartup = function()
    print("Register LUA cloud services")
    for _, a in pairs(server.cloudServices) do
        print("add " .. a.name)
        cloud.registerService(a.name, a.internal, a.minProtocolVersion, a.maxProtocolVersion, a.limits)
    end
    for _, f in pairs(server.runAtStartup) do
        f()
    end
end

-- Handle action request to websocket
server.handleAction = function(action, printer, data, result)
    if server.actionInspectors[action] ~= nil then
        return server.actionInspectors[action](printer, data, result)
    end
    return result
end
server.handleDynRequest = function(cmd, request, response)
    if server.dynRequests[cmd] ~= nil then
        server.dynRequests[cmd](request, response)
    end
end

server.handleServerCommand = function(cmd, printer, params)
    local list = server.serverCommands[cmd]
    if list ~= nil then
        for _, f in pairs(list) do
            f(cmd, printer, params)
        end
    end
end

server.detectLanguageForUrl = function(url)
    for _, f in pairs(server.languageDetectors) do
        local v = f(url)
        if v ~= nil then
            return v
        end
    end
    return nil
end

server.handleEvent = function(event, printer, data)
    -- print("Handle event " .. event)
    local list = server.eventListener[event]
    if list ~= nil then
        for _, f in pairs(list) do
            f(event, printer, data)
        end
    end
end

-- Utility functions for all

function string.startsWith(String, Start)
    return string.sub(String, 1, string.len(Start)) == Start
end

function string.endsWith(String, End)
    return End == '' or string.sub(String, -string.len(End)) == End
end

rendering = require("render")
rendering.init()

--rs.dispatchJob("server.testthread1",{x=3})
--print(table.show(settings.getArray("_remoteServer",{}),"Remote"))
--print("Server OS",settings.getInteger("ServerOS",-1))
--server:registerResponseHandler(testResponse);
--print(table.show(server, "server"))
--print(table.show(testobj,"testobj"))
--print("object logged")
--rs:logJsonObject(testobj);
--na = {"x",3,5.78,true }
--print("Array logged")
--rs.logJsonArray(na)
--print("Response handlers " .. #server.responseInspectors)
--print("Website root: " .. rs.websiteDirectory)
