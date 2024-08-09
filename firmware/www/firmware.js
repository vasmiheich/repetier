/**
 * Created by littwin on 14.07.15.
 */
(function () {

    const printTabEntry = {
        name: "<?php _('Firmware Upload') ?>",
        icon: "rs rs-firmwareupload",
        visible: "showFirmwareUpload",
        state: "printer.firmwareupload",
        prio: 5000,
        requireOnline: false,
        requireActive: false
    }

    const menuEntry = {
        name: "<?php _('Firmware Upload') ?>",
        icon: "rs rs-firmwareupload",
        visible: "true",
        feature: "printer-firmwareUpload",
        prio: 5000,
        requireOnline: false,
        requireActive: false
    }

    angular.module('RSFirmwareUploader', ['RSBase', 'ui.router'])
        .config(['RSFrontendProvider', '$stateProvider', function (RSFrontend, $stateProvider) {
            RSFrontend.registerPrinterMenuEntry(menuEntry);
            RSFrontend.registerPrinterTab(printTabEntry);
            RSFrontend.setVisible("showFirmwareUpload", false);
            $stateProvider.state('printer.firmwareupload', {
                url: '/firmwareupload',
                templateUrl: '/mod/firmware/firmware.php?lang=' + window.lang,
                controller: 'FirmwareUploadController'
            })
        }])
        .run(['$state', 'RSFrontend','$rootScope', function ($state, RSFrontend,$rootScope) {
            menuEntry.exec = function () {
                $state.go('printer.firmwareupload',{slug: $rootScope.activeSlug});
            };
        }])
        .controller("FirmwareUploadController", ["$scope", "$rootScope", "Flash", "RSCom", "$timeout","$interval", 'RSPrinter', function ($scope, $rootScope, Flash, RSCom, $timeout,$interval, RSPrinter) {
            $rootScope.frontend.setVisible("showFirmwareUpload", true);
            RSPrinter.setActivePage($rootScope.activeSlug, {state: 'printer.firmwareupload', params: {slug: $rootScope.activeSlug}})
            $scope.response = false;
            $scope.activeBoardId = 1;
            $scope.boards = [];
            $scope.uploadUrl = "/dyn/firmware_upload/" + $rootScope.activeSlug;
            var setBoardFromId = function () {
                angular.forEach($scope.boards, function (b) {
                    if (b.id === $scope.activeBoardId)
                        $scope.activeBoard = b;
                });
            };
            RSCom.send("firmware_boards", {}).then(function (data) {
                $scope.tools = data.tools;
                $scope.boards = data.boards;
                setBoardFromId();
            });
            RSCom.send("getPrinterSetting", {key: "firmwareuploader_board", def: "1"}).then(function (data) {
                $scope.activeBoardId = parseInt(data.value);
                setBoardFromId();
                $scope.$watch("activeBoardId", function () {
                    setBoardFromId();
                    RSCom.send("setPrinterSetting", {key: "firmwareuploader_board", value: "" + $scope.activeBoardId});
                });
            });
            RSCom.send("getPrinterSetting", {key: "firmwareuploader_extraPort", def: ""}).then(function (data) {
                $scope.extraPort = data.value;
                $scope.$watch("extraPort", function () {
                    RSCom.send("setPrinterSetting", {key: "firmwareuploader_extraPort", value: ""+$scope.extraPort});
                });
            });
            RSCom.send("getPrinterSetting", {key: "firmwareuploader_extraFolder", def: "-1"}).then(function (data) {
                $scope.extraFolder = parseInt(data.value);
                $scope.$watch("extraFolder", function () {
                    RSCom.send("setPrinterSetting", {key: "firmwareuploader_extraFolder", value: "" + $scope.extraFolder});
                });
            });
            $scope.refreshPorts = function () {
                RSCom.send("listPorts", {}).then(function (data) {
                    $scope.ports = data;
                });
            };
            $scope.folders = [];
            var getFolders = function() {
                RSCom.send("getFolders",{}).then(function(data) {
                    $scope.folders = data.folders;
                })
            };
            getFolders();
            const updPromise = $interval($scope.refreshPorts, 1500)
            $scope.refreshPorts();
            let jobId = 0
            let lines = ['']
            let linesCol = 0, linesRow = 0
            var appendOutput = function (line) {
                line = line.replace(/ /g, '&nbsp;')
                line = line.replace(/<|>/ig, function (m) {
                    return '&' + (m === '>' ? 'g' : 'l') + 't;';
                })
                for (var i = 0; i < line.length; i++) {
                    var c = line.charAt(i)
                    if(c === '\n') {
                        lines.push('')
                        linesCol = 0
                        linesRow++
                    } else if(c === '\r') {
                        linesCol = 0
                    } else {
                        if(linesCol === 0) {
                            lines[linesRow] = ''
                        }
                        linesCol++
                        lines[linesRow] += c
                    }
                }
                $('#firmware_output').html(lines.join('<br>'))
                $timeout(function () {
                    var elem = document.getElementById('firmware_output');
                    elem.scrollTop = elem.scrollHeight;
                })
            };
            $scope.$on('workerMessage', function (event, data) {
                if (data.data.id === jobId && data.data.key === "print")
                    appendOutput(data.data.message);
            });
            $scope.$on('workerFinished', function (event, data) {
                if(data.data.id === jobId && data.data.message === 'UploadFinished' ) {
                    Flash.success("<?php _('Upload finished') ?>");
                }
            });
            var firmwareUploadHandler = function () {
                $('#firmware_output').html("");
                lines = ['']
                linesCol = 0
                linesRow = 0
                appendOutput("<?php _('Uploading firmware binary ...') ?>\n");
                var input = $(this),
                    // numFiles = input.get(0).files ? input.get(0).files.length : 1,
                    label = input.val().replace(/\\/g, '/').replace(/.*\//, '');
                var extPos = label.lastIndexOf('.');
                var ext = '';
                if (extPos > 0) ext = label.substr(extPos + 1);
                if (ext === "elf" || ext === "hex")
                    label = label.substr(0, extPos);
                $('#firmwareName').val(label);
                $scope.uploading = true;
                RSCom.extendPing(300); // 5 minutes before we time out
                $('#formuploadfirmware').ajaxSubmit({
                    success: function (data) {
                        if (data.error) {
                            appendOutput(data.error)
                        } else {
                            jobId = data.jobId;
                        }
                        $scope.uploading = false;
                        RSCom.extendPing(0); // Reset default timeout
                        $scope.response = data;
                    },
                    headers: {
                        'X-Csrf-Token': RSCom.getCookie('Csrf-Token')
                    }
                });
                if (label !== "")
                    input.val("");
                $scope.$apply();
            };
            // Element does not always exist at this moment, so wait for existence
            const registerFirmwareUploadHandler = function () {
                const n = $('#firmwareUpload')
                if (n.length > 0) {
                    n.on('change', firmwareUploadHandler)
                } else {
                    setTimeout(registerFirmwareUploadHandler, 100)
                }
            }
            registerFirmwareUploadHandler();
            $scope.$on('$destroy', function () {
                $rootScope.frontend.setVisible("showFirmwareUpload", false);
                $interval.cancel(updPromise);
            });
        }])
    ;
}());
