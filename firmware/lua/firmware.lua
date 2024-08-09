--
-- Firmware upload
-- (C) 2015 Hot-World GmbH & Co. KG
--

firmwareUploadTools = {
    { id = 1, name = "avrdude", info = "Uploader for AVR based boards", uploader = "avrdude", params = "-C{bindirDude} {verbose}-p{mcu} -c{protocol} -P{port} -b{speed} -D -Uflash:w:{image}:i", quiet = "-q -q ", verbose = "-v ", format = "hex" },
    { id = 2, name = "bossacArduino", info = "Arduino Due Programming Port", uploader = "bossac-arduino", params = "{verbose}-p {shortport} -U {native_usb} -e -w -v -b {image} -R", quiet = "", verbose = "-d ", format = "bin" },
    { id = 5, name = "bossac", info = "Bossac", uploader = "bossac", params = "{verbose}-p {extraPort2} --offset={offset} --usb-port={native_usb} -e -v -w -R {image}", quiet = "", verbose = "-d ", format = "bin" },
    { id = 3, name = "teensy", info = "Teensy based boards", uploader = "teensa_loader_cli", params = "{verbose}-mmcu={mcu} -w {image}", quiet = "", verbose = "-v ", format = "hex" },
    { id = 4, name = "avrdudeCDC", info = "Uploader for AVR based boards", uploader = "avrdude", params = "-C{bindirDude} {verbose}-p{mcu} -c{protocol} -P{extraPort} -b{speed} -D -Uflash:w:{image}:i", quiet = "-q -q ", verbose = "-v ", format = "hex" },
    { id = 5, name = "dfu", info = "DFU or DFUSe upload format for many types, e.g. STM32", uploader = "dfu-util", params = "-d vid:pid,0x0483:0xDF11 -a 0 -s {address}:leave -D {image}", quiet = "", verbose = "-v ", format = "bin" },
    { id = 6, name = "firmwarebin", info = "Copy firmware as firmware.bin to sd card", uploader = "firmwarebin", params = "", quiet = "", verbose = "", format = "bin" },
}
firmwareUploadBoards = {
    { id = 1, name = "Arduino Mega 2560 boards", tool = "avrdude", maximum_data_size = 8192, maximum_size = 253952, mcu = "atmega2560", speed = 115200, protocol = "wiring" },
    { id = 2, name = "Arduino DUE Programming Port", tool = "bossacArduino", protocol = "sam-ba", maximum_size = 524288, use_1200bps_touch = true, wait_for_upload_port = false, native_usb = false },
    { id = 3, name = "Arduino DUE Native Port", tool = "bossacArduino", protocol = "sam-ba", maximum_size = 524288, use_1200bps_touch = true, wait_for_upload_port = true, native_usb = true },
    { id = 8, name = "Adafruit Grand Central M4", tool = "bossac", protocol = "sam-ba", offset = 0x4000, maximum_size = 507904, use_1200bps_touch = false, wait_for_upload_port = true, native_usb = 1, extraPort = true },
    { id = 4, name = "Printrboard with CDC bootloader", tool = "avrdudeCDC", mcu = "at90usb1286", protocol = "avr109", maximum_size = 130048, speed = 115200, extraPort = true },
    { id = 5, name = "Teensy 2++ boards", tool = "teensy", protocol = "halfkay", mcu = "at90usb1286" },
    { id = 6, name = "Arduino 1284 boards 57600 baud", tool = "avrdude", maximum_data_size = 8192, maximum_size = 131072, mcu = "atmega1284p", speed = 57600, protocol = "arduino" },
    { id = 7, name = "Arduino 1284 boards 115200 baud", tool = "avrdude", maximum_data_size = 8192, maximum_size = 131072, mcu = "atmega1284p", speed = 115200, protocol = "arduino" },
    { id = 9, name = "STM32Fxxxx based boards with DfuSe on 0x8000000", tool = "dfu", address = "0x08000000", hint = "Uploads to the first available device in DFU mode! Make sure only one is in that mode. Upload will start at flash memory address 0x08000000. Uploading to wrong address can break bootloader and make board inoperable until you put a new bootloader on it." },
    { id = 11, name = "STM32Fxxxx based boards with DfuSe on 0x8008000", tool = "dfu", address = "0x08008000", hint = "Uploads to the first available device in DFU mode! Make sure only one is in that mode. Upload will start at flash memory address 0x08008000. Uploading to wrong address can break bootloader and make board inoperable until you put a new bootloader on it." },
    { id = 10, name = "Copy firmware as firmware.bin to sd card", tool = "firmwarebin", hint = "", extraFolder = true },
}

-- Convert tool name to tool entry
function firmwareUploadToolByName(name)
    for _, tool in pairs(firmwareUploadTools) do
        if tool.name == name then
            return tool
        end
    end
    return nil
end

-- Convert board id to board entry
function firmwareUploadBoardById(id)
    for _, board in pairs(firmwareUploadBoards) do
        if board.id == tonumber(id) then
            return board
        end
    end
    return nil
end

function fwWaitUploadPort(ports, defaultPort)
    local elapsed = 0
    while elapsed < 6000 do
        local currentPort = rs.portList
        local detected = {}
        for _, p in pairs(currentPort) do
            detected[rs:reducePort(p)] = false
        end
        for _, p in pairs(ports) do
            detected[rs:reducePort(p)] = true
        end
        for p, v in pairs(detected) do
            if v == false then
                return p
            end
        end
        rs:sleep(250)
        elapsed = elapsed + 250
        if elapsed > 800 and settings.getInteger("ServerOS", -1) ~= 0 then
            return defaultPort
        end
    end
    return defaultPort
end

function fileExists(name)
    local f = io.open(name, "r")
    if f ~= nil then
        io.close(f)
        return true
    end
    return false
end

-- Called from work dispatcher, runs and monitors update process.
function firmwareUploadJob(data, wd)
    local i
    local out = function(line)
        print("Line: " .. line)
        wd.sendMessage("print", line)
    end
    if rs.demoVersion then
        out("Function not possible in demo mode!\n")
        return
    end
    local binDir = rs.pathConcat(fwUplModDir, "bin")
    local printer = rs.printerBySlug(data.slug)
    local boardId = printer.getSetting("firmwareuploader_board")
    local board = firmwareUploadBoardById(boardId)
    if board == nil then
        out(rs:translate("Error", data.lang) .. ":" .. rs.t1("Unknown board id $1", boardId, data.lang))
        return
    end
    local tool = firmwareUploadToolByName(board.tool)
    local bin = rs.pathConcat(binDir, tool.uploader)
    if settings.getInteger("ServerOS", -1) == 0 then
        bin = bin .. ".exe"
    end
    local vars = board
    vars.extraPort = printer.getSetting("firmwareuploader_extraPort")
    vars.extraFolder = tonumber(printer.getSetting("firmwareuploader_extraFolder"))
    vars.bindir = binDir
    vars.bindirDude = rs.pathConcat(binDir, "avrdude.conf")
    vars.image = data.filename
    local param = tool.params
    if data.verbose == 1 then
        param = param:gsub("{verbose}", tool.verbose)
        param = param:gsub("{quiet}", "")
    else
        param = param:gsub("{verbose}", "")
        param = param:gsub("{quiet}", tool.quiet)
    end
    vars.port = rs:reducePort(printer.config.connection.serial.device)
    local d1, d2
    if not rs.pathExists(vars.image) then
        out(rs:t("Error", data.lang) .. ":" .. rs:t("Firmware image file not found", data.lang))
        return
    end
    if rs.pathExtension(vars.image) ~= "." .. tool.format then
        wd.sendMessage("print", rs:translate("Error", data.lang) .. ":" .. rs:t2("File has not extension $1 but has $2", tool.format, rs.pathExtension(vars.image), data.lang))
        rs.pathDelete(vars.image)
        return
    end
    local wasActive = printer.activated
    if wasActive then
        out(rs:t("Stopping printer connection", data.lang) .. "\n")
        printer:deactivatePrinter()
        while printer.activated do
            rs:sleep(10)
        end
        rs:sleep(100)
    end
    local ports
    if board.use_1200bps_touch then
        ports = rs.portList
        rs:touchSerialWithBaud(vars.port, 1200)
        rs:sleep(1000)
        if board.wait_for_upload_port then
            vars.port = fwWaitUploadPort(ports, vars.port)
        end
    end
    d1, d2, vars.shortport = vars.port:find("/?([^/]+)$")
    vars.shortport2 = vars.shortport:gsub("tty%.usbmodem", "cu.usbmodem")
    vars.extraPort2 = vars.extraPort:gsub("tty%.usbmodem", "cu.usbmodem")
    local paramArray = {}
    local execmd = bin
    for i in string.gmatch(param, "%S+") do
        for key, val in pairs(vars) do
            local rep = string.gsub(tostring(val), " ", "\\ ")
            rep = tostring(val)
            i = i:gsub("{" .. key .. "}", rep)
        end
        paramArray[#paramArray + 1] = i
        execmd = execmd .. " " .. i
    end
    if board.tool == "dfu" then
        -- Add dfu suffix in case it did not happen,
        local binsuffix = rs.pathConcat(binDir, "dfu-suffix")
        if settings.getInteger("ServerOS", -1) == 0 then
            binsuffix = binsuffix .. ".exe"
        end
        local paramSuffix = "-v 0x0483 -p 0xDF11 -d 0xffff -a {image}"
        local paramSuffixArray = {}
        local psParams = ""
        for i in string.gmatch(paramSuffix, "%S+") do
            for key, val in pairs(vars) do
                local rep = string.gsub(tostring(val), " ", "\\ ")
                rep = tostring(val)
                i = i:gsub("{" .. key .. "}", rep)
            end
            paramSuffixArray[#paramSuffixArray + 1] = i
            psParams = psParams .. " " .. i
        end
        out(binsuffix .. " " .. psParams .. "\n")
        -- rs:runExecutableWithOutput(binsuffix, paramSuffixArray, out)
        rs:runExecutableWithOutputMessages(binsuffix, paramSuffixArray, wd, "print")
        out("\n")
    end
    if board.tool == "firmwarebin" then
        -- get folders
        local dest = ''
        local cur = ''
        local folders = settings.getArray("_folders", {})
        for key, val in pairs(folders) do
            if val.id == vars.extraFolder then
                dest = val.dir .. "/firmware.bin"
                cur = val.dir .. "/FIRMWARE.CUR"
                break
            end
        end
        if dest == "" then
            out(rs:t("No target directory selected!", data.lang) .. "\n")
        else
            if fileExists(cur) == false then
                out(rs.t1("Old firmware file $1 did not exist. Maybe you are using the wrong directory!", cur, data.lang) .. "\n")
            end
            out(rs.t1("Copy to $1", dest, data.lang) .. "\n")
            -- copy file
            local inp = io.open(data.filename, "rb")
            local fout = io.open(dest, "wb")
            if fout ~= nil then
                local fdata = inp:read("*all")
                fout:write(fdata)
                fout:close()
                inp:close()
                out(rs.t("Reset printer or send M997 to install new version.", data.lang) .. "\n")
            else
                out(rs.t1("Could not create target file $1.", dest, data.lang) .. "\n")
            end
        end
    else
        out(execmd .. "\n")
        -- rs:runExecutableWithOutput(bin, paramArray, out)
        rs:runExecutableWithOutputMessages(bin, paramArray, wd, "print")
    end
    if board.use_1200bps_touch then
        rs:sleep(1000)
    end
    out(rs.t("Upload finished", data.lang) .. "\n")
    rs:pathDelete(data.filename)
    if wasActive then
        out(rs:t("Reactivating printer connection ...", data.lang) .. "\n")
        printer:activatePrinter()
    end
    wd.sendMessage("print", rs.t("Firmware upload finished.", data.lang))
    wd.finished("UploadFinished")
end

function firmwareUploadCalled(req, resp)
    local ret = {}
    local slug = req.pathSegments[3]
    local printer = rs.printerBySlug(slug)
    if req.session.canConfigure(slug) == false then
        ret.error = req.t("Configuration permission required!")
        resp.returnJson(ret)
        return
    end
    local fname, fsize = req.file()
    local ext = rs.pathExtension(req.originalFilename)
    local tempFile = rs.tempFile(ext)
    rs.pathRename(fname, tempFile)
    if printer ~= nil and fsize > 0 then
        ret.jobId = rs.dispatchJob("firmwareUploadJob", { slug = slug, filename = tempFile, verbose = req.param("verbose", "0"), lang = req.language }, 100000)
    else
        ret.error = "No file received"
    end
    resp.returnJson(ret)
end

-- Return object with list of programming tools and boards available
function firmwareGetBoards(access, data, result)
    result.tools = firmwareUploadTools
    result.boards = firmwareUploadBoards
    return result
end

fwUplModDir = rs.pathConcat(rs.modulesDirectory, "firmware")
server:registerFrontendCSS("/mod/firmware/firmware.css")
server:registerFrontendModule("RSFirmwareUploader")
server:registerFrontendJS("/mod/firmware/firmware.js")
server:registerDynRequest("firmware_upload", firmwareUploadCalled)
server:registerAction("firmware_boards", firmwareGetBoards)
rs.registerPrinterSetting("firmwareuploader_board", "1", "printer-firmwareUpload-config")
rs.registerPrinterSetting("firmwareuploader_extraPort", "", "printer-firmwareUpload-config")
rs.registerPrinterSetting("firmwareuploader_extraFolder", "-1", "printer-firmwareUpload-config")
