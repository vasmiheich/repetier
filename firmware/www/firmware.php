<div class="panel panel-default margin-top">
  <div class="panel-heading">
    <i class="rs rs-firmwareupload margin-right"></i> <?php _('Flash Firmware') ?>
  </div>
  <div class="panel-body">
    <form enctype="multipart/form-data" method="post" action="{{uploadUrl}}" id="formuploadfirmware" class="form-horizontal">

      <div class="row" ng-show="user.showFeature('printer-firmwareUpload-config')">
        <div class="col-sm-12">
          <label><?php _('Printer Board Type') ?> </label>
          <select class="form-control" ng-model="activeBoardId" ng-options="f.id as f.name for f in boards"></select>
          <p ng-if="activeBoard.hint" style="margin-top:8px">{{activeBoard.hint}}</p>
        </div>

        <div class="col-sm-12" ng-show="activeBoard.extraPort===true">
          <label><?php _('Upload port') ?></label>
          <div>
            <div class="input-group">
              <input type="text" class="form-control" ng-model="extraPort">
              <span class="input-group-btn">
                  <div class="btn-group" uib-dropdown>
                      <button type="button" class="btn btn-default" uib-dropdown-toggle>
                          <?php _('Ports') ?> <span class="caret"></span>
                      </button>
                      <ul class="dropdown-menu" role="menu" style="max-height:200px;overflow:auto">
                          <li ng-repeat="p in ports track by $index">
                              <a href="javascript:void(0)" ng-click="$parent.extraPort=p">{{p}}</a></li>
                      </ul>
                  </div>
                </span>
            </div>
            <small><?php _('This uploader changes the USB signature which may lead to a different port name. Please enter the port name when in bootloader mode.') ?>
            </small>
          </div>
        </div>
      </div>

      <div class="margin-top clearfix" ng-show="activeBoard.extraFolder && user.showFeature('printer-firmwareUpload-config')">
        <div class="row">
          <label class="col-sm-12"><?php _('Target folder') ?></label>
          <div class="col-sm-11">
            <select class="form-control" ng-model="extraFolder">
              <option ng-repeat="f in folders track by $index" ng-value="f.id">{{f.name}}: {{f.dir}}</option>
            </select>
            <small><?php _('The firmware will be copied to this directory. Make sure to select the one pointing to your printers sd card.') ?>
            </small>
          </div>
          <div class="col-sm-1">
            <a ui-sref="gsettings.folders()" class="btn btn-primary" style="width: 100%">
              <i class="fa fa-plus"></i>
            </a>
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:20px" ng-show="user.showFeature('printer-firmwareUpload')">
        <div class="col-sm-12">
            <span class="btn btn-primary btn-block btn-file" ng-disabled="uploading">
            <i class="fa fa-upload rs-bigtab"></i>
            <span ng-hide="uploading"><?php _('Upload Firmware Image') ?></span><span ng-show="uploading"><?php _('Uploading ...') ?></span>
            <input type="file" name="filename" id="firmwareUpload"/>
            </span>
        </div>
      </div>
    </form>
    <div ng-show="user.showFeature('printer-firmwareUpload')">
      <br/>
      <h4><?php _('Output') ?></h4>
      <div class="form-group">

        <div class="checkbox">
          <label class="checkbox">
            <input type="checkbox" name="verbose" value="1"> <?php _('Verbose output') ?>
          </label>
        </div>

      </div>
      <div id="firmware_output" class="logpanel select-text" style="height:300px;overflow:scroll;margin-top:15px;font-family: monospace;" autoscroll2="logAutoscroll">
      </div>
    </div>
  </div>
</div>
