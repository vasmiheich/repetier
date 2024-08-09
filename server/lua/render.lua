-- Handle all rendering related tasks

local M = {}

M.render = function(data, wd)
    if not rs.supportRenderedImages then
        return
    end
    local printer = rs.printerBySlug(data.slug)
    local manager = printer:printjobManagerFromFile(data.layer)
    local printJob = manager.findById(data.id)
    if printJob == nil then
        return
    end
    printJob.waitForUnblockedAndBlock()
    local config = rs.pathConcat(rs.pathConcat(rs.storageDirectory, "database"), "renderer.json")
    -- Check if we have a fast remote server doing our work
    local renderService = cloud.findLocalService("repetierRenderer")
    local base = rs.pathBasename(data.layer)
    local baseExt = rs.pathExtension(data.layer)
    local baseFile = base .. baseExt
    local baseDir = rs.pathParent(data.layer)
    local baseDirFile = rs.pathConcat(baseDir, base)
    for _, server in pairs(cloud.getRemoteServer()) do
        local canHandle, version = server.canHandleService(renderService)
        if canHandle then
            local job = server.createJob()
            if job.initialize(server, renderService, version, baseFile) then
                job.sendFileAs(config, "renderer.json")
                job.sendFileAs(data.layer, baseFile)
                if baseExt == ".layer" then
                    job.sendFileAs(rs.pathConcat(baseDir, base .. ".linfo"), base .. ".linfo")
                end
                job.sendDataComplete()
                while not job.isFinished() do
                    rs.sleep(1000)
                end
                if not job.errorOnIsFinished() then
                    job.getFileAs(base .. "_l.png", rs.pathConcat(baseDir, printJob.idName) .. "_l.png")
                    job.getFileAs(base .. "_m.png", rs.pathConcat(baseDir, printJob.idName) .. "_m.png")
                    job.getFileAs(base .. "_s.png", rs.pathConcat(baseDir, printJob.idName) .. "_s.png")
                    if (not job.error()) and job.sendFinished() then
                        print("Images rendered over cloud for " .. data.id)
                        if baseExt == ".layer" then
                            if printJob ~= nil then
                                printJob.incrementInfoVersion()
                            end
                            printer.fireEvent("newRenderImage", { list = data.list, id = data.id, slug = data.slug })
                        end
                        printJob.setBlockedForFileChanges(false)
                        return
                    end
                end
                if job.error() then
                    print("error rendering over cloud")
                    job.sendFinished()
                end
            end
        end
    end
    -- No, so let us do it our self
    local exe = M.executable()
    if exe == nil then
        print "RepetierRenderer not found - skipping image preview!"
    else
        if settings.getInteger("ServerOS", -1) == 0 then
            rs.runExecutable(exe, { "/i", data.layer, "/c", config })
        else
            rs.runExecutable(exe, { "-i", data.layer, "-c", config })
        end
        if data.list ~= "stl" then
            -- Check if it is gcode and still exists
            local printer = rs.printerBySlug(data.slug)
            local manager = printer.printjobManagerFromFile(data.layer)
            local job = manager.findById(data.id)
            if job == nil then
                manager.deleteAssociatedFilesForId(data.id)
            else
                -- name might have changed meanwhile
                if base ~= printJob.idName then
                    print("Rename " .. base .. " to " .. printJob.idName)
                    os.rename(baseDirFile .. "_l.png", rs.pathConcat(baseDir, printJob.idName) .. "_l.png")
                    os.rename(baseDirFile .. "_m.png", rs.pathConcat(baseDir, printJob.idName) .. "_m.png")
                    os.rename(baseDirFile .. "_s.png", rs.pathConcat(baseDir, printJob.idName) .. "_s.png")
                end
                job.incrementInfoVersion()
                printer.fireEvent("newRenderImage", { list = data.list, id = data.id, slug = data.slug })
            end
        end
    end
    printJob.setBlockedForFileChanges(false)
end

M.renderCloudRemote = function(event, printer, data)
    print("renderCloudRemote called")
    local remote = cloud.findRemoteBuilding(data.id)
    local exe = M.executable()
    local config = rs.pathConcat(data.folder, "renderer.json")
    local fileToRender = rs.pathConcat(data.folder, data.data)
    local base = rs.pathBasename(data.data)
    print("base = " .. base)
    if settings.getInteger("ServerOS", -1) == 0 then
        rs.runExecutable(exe, { "/i", fileToRender, "/c", config })
    else
        rs.runExecutable(exe, { "-i", fileToRender, "-c", config })
    end
    remote.addFile(base .. "_s.png")
    remote.addFile(base .. "_m.png")
    remote.addFile(base .. "_l.png")
end

M.gcodeInfoUpdatedHandler = function(event, printer, data)
    local manager = printer:printjobManagerFromFile(data.modelPath)
    -- since it gets called for all sharing printer it might happen that only one has a manager
    if manager == nil then
        return
    end
    local name = manager:decodeNamePart(data.modelPath)
    local id = manager:decodeIdPart(data.modelPath)
    local imageFile = manager:encodeName(id, name .. "_l", "png")
    if printer.slug == manager.printer.slug and not rs.pathExists(imageFile) then
        rs.dispatchJob("rendering.render", { id = id, image = imageFile, layer = manager:encodeName(id, name, "layer"), slug = printer.slug, list = manager.managerType }, 1000)
    end
end

-- Find the executable of the renderer software
M.executable = function()
    local exe = rs.applicationDirectory
    local unixName = rs.pathConcat(exe, "RepetierRenderer")
    local winName = rs.pathConcat(exe, "RepetierRenderer.exe")
    if rs.pathExists(unixName) then
        return unixName
    end
    if rs.pathExists(winName) then
        return winName
    end
    return nil
end

-- Render all gcode files having no images yet
M.updateMissingIn = function(manager)
    local list = manager.listJobs()
    for _, model in pairs(list) do
        local layerFile = manager:encodeName(model.id, model.name, "layer")
        local imageFile = manager:encodeName(model.id, model.name .. "_l", "png")
        if rs.pathExists(layerFile) and rs.pathExists(imageFile) == false then
            rs.dispatchJob("rendering.render", { id = model.id, layer = manager:encodeName(model.id, model.name, "layer"), slug = model.printer.slug, list = manager.managerType }, 900)
        end
    end
end

M.updateIn = function(manager)
    local list = manager.listJobs()
    for _, model in pairs(list) do
        local layerFile = manager:encodeName(model.id, model.name, "layer")
        if rs.pathExists(layerFile) then
            rs.dispatchJob("rendering.render", { id = model.id, layer = manager:encodeName(model.id, model.name, "layer"), slug = model.printer.slug, list = manager.managerType }, 1)
        end
    end
end

-- Scan all printers for unrendered files
M.updateAllMissing = function()
    if not rs.supportRenderedImages then
        return
    end
    -- Copy configuration if not present
    local source = rs.pathConcat(rs.pathConcat(rs.pathConcat(rs.modulesDirectory, "server"), "data"), "renderer.json")
    local target = rs.pathConcat(rs.pathConcat(rs.storageDirectory, "database"), "renderer.json")
    if not rs.pathExists(target) then
        rs.pathCopy(source, target)
    end
    -- Render all gcodes
    local printers = rs.printerList
    for _, printer in pairs(printers) do
        M.updateMissingIn(printer.modelPrintjobManager)
        M.updateMissingIn(printer.jobPrintjobManager)
    end
end

M.getRenderSettings = function(access, data, result)
    return rs.loadJSONFile(rs.pathConcat(rs.pathConcat(rs.storageDirectory, "database"), "renderer.json"))
end

M.setRenderSettings = function(access, data, result)
    if access.session.canUseFeature("config-preview-images", "") then
        rs.saveJSONObjectFile(rs.pathConcat(rs.pathConcat(rs.storageDirectory, "database"), "renderer.json"), data)
    end
    return result
end

M.resetRenderSettings = function(access, data, result)
    local target = rs.pathConcat(rs.pathConcat(rs.storageDirectory, "database"), "renderer.json")
    if access.session.canUseFeature("config-preview-images", "") then
        local source = rs.pathConcat(rs.pathConcat(rs.pathConcat(rs.modulesDirectory, "server"), "data"), "renderer.json")
        rs.pathCopy(source, target)
    end
    return rs.loadJSONFile(target)
end

M.updateAllRenderings = function(access, data, result)
    if access.session.canUseFeature("config-preview-images", "") then
        local printers = rs.printerList
        for _, printer in pairs(printers) do
            M.updateIn(printer.modelPrintjobManager)
            M.updateIn(printer.jobPrintjobManager)
        end
        rs.updateProjectRenderings()
    end
end

M.modulePath = function()
    return rs.pathConcat(rs.modulesDirectory, "server")
end

M.getImage = function(request, response)
    local imgSize = request.param("t", "l")
    local img = rs.pathConcat(rs.pathConcat(rs.pathConcat(M.modulePath(), "www"), "img"), "rendering_" .. imgSize .. ".png")
    if request.session.access then
        local queue = request.param("q", "models")
        local id = request.param("id", "-1")
        local slug = request.param("slug", "")
        local printer = rs.printerBySlug(slug)
        if (printer == nil) then
            print("Unknown printer " .. slug .. " for rendered image")
            response.viewStaticFile(img)
            return
        end
        local jobQueue
        if (queue == "models") then
            jobQueue = printer.modelPrintjobManager.responsibleModelManager
        else
            jobQueue = printer.jobPrintjobManager
        end
        local job = jobQueue.findById(id)
        if (job == nil) then
            print("Unknown job id " .. id .. " for rendered image")
            response.viewStaticFile(img)
            return
        end
        local img2 = jobQueue.encodeName(id, job.name .. "_" .. imgSize, "png")
        if (rs.pathExists(img2)) then
            img = img2
        end
        response.viewStaticFile(img)
    else
        response.viewStaticFile(img)
    end
end
M.init = function()
    server:registerEventHandler("gcodeInfoUpdated", M.gcodeInfoUpdatedHandler)
    server:registerEventHandler("cloud:execute:repetierRenderer", M.renderCloudRemote)
    server:registerRunAtStartup(M.updateAllMissing)
    server:registerAction('getRenderSettings', M.getRenderSettings)
    server:registerAction('setRenderSettings', M.setRenderSettings)
    server:registerAction('resetRenderSettings', M.resetRenderSettings)
    server:registerAction('updateAllRenderings', M.updateAllRenderings)
    server:registerDynRequest('render_image', M.getImage)
    server:registerCloudService({ name = "G-Code-Renderer", internal = "repetierRenderer", minProtocolVersion = 1, maxProtocolVersion = 1, limits = "" })
end

return M;
