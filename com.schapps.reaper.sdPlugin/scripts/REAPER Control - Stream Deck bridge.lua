-- REAPER Control - Stream Deck bridge
--
-- Companion script for the REAPER Control Stream Deck plugin. REAPER's web
-- interface has no command for adding FX, so the plugin writes a request into
-- ExtState and then runs this script by its command ID over the web interface.
--
-- One-time setup: Actions > Show action list > New action > Load ReaScript...,
-- pick this file, then run it once from the action list. That first manual run
-- registers the script's command ID and REAPER's resource path with the plugin.

local SECTION = "ReaperControl"
local BRIDGE_VERSION = "1"

-- Request format (key "request"), tab-separated:
--   info
--   addfx \t <target> \t <show> \t <fx name>
-- target: "selected" | "master" | "track:<1-based number>"
-- show:   "0" none | "1" floating FX window | "2" FX chain window
-- fx name: anything TrackFX_AddByName accepts, including "<name>.RfxChain".
-- The FX name is the last field so it can contain anything but a tab.
--
-- Result (key "result"): "ok" or "error", then tab-separated details.
-- info  -> ok \t <GetAppVersion(), e.g. "7.77/macOS-arm64"> \t <resource path>
-- addfx -> ok \t <tracks added to> \t <name of the first FX added>

local function set_result(status, message)
  reaper.SetExtState(SECTION, "result", status .. "\t" .. (message or ""), false)
end

local function register()
  local _, _, section_id, cmd_id = reaper.get_action_context()
  local named = reaper.ReverseNamedCommandLookup(cmd_id)
  if section_id ~= 0 or not named then
    reaper.MB("Load this script into the Main section of the action list, then run it from there.",
      "REAPER Control", 0)
    return
  end
  reaper.SetExtState(SECTION, "commandId", "_" .. named, true)
  reaper.SetExtState(SECTION, "resourcePath", reaper.GetResourcePath(), true)
  reaper.SetExtState(SECTION, "appVersion", reaper.GetAppVersion(), true)
  reaper.SetExtState(SECTION, "bridgeVersion", BRIDGE_VERSION, true)
  reaper.MB("REAPER Control bridge is set up. You can now use FX keys on your Stream Deck.",
    "REAPER Control", 0)
end

local function target_tracks(target)
  local tracks = {}
  if target == "master" then
    tracks[1] = reaper.GetMasterTrack(0)
  elseif target == "selected" then
    for i = 0, reaper.CountSelectedTracks(0) - 1 do
      tracks[#tracks + 1] = reaper.GetSelectedTrack(0, i)
    end
  else
    local n = tonumber(target:match("^track:(%d+)$"))
    local track = n and reaper.GetTrack(0, n - 1)
    if track then tracks[1] = track end
  end
  return tracks
end

local function add_fx(target, show, fx_name)
  local tracks = target_tracks(target)
  if #tracks == 0 then
    set_result("error", "no target track")
    return
  end

  reaper.Undo_BeginBlock()
  reaper.PreventUIRefresh(1)
  local added, added_name = 0, ""
  for _, track in ipairs(tracks) do
    local index = reaper.TrackFX_AddByName(track, fx_name, false, -1)
    if index >= 0 then
      added = added + 1
      if added == 1 then added_name = select(2, reaper.TrackFX_GetFXName(track, index)) end
      if show == "1" then
        reaper.TrackFX_Show(track, index, 3)
      elseif show == "2" then
        reaper.TrackFX_Show(track, index, 1)
      end
    end
  end
  reaper.PreventUIRefresh(-1)
  reaper.Undo_EndBlock("Insert FX: " .. fx_name, -1)

  if added == 0 then
    set_result("error", "FX not found: " .. fx_name)
  else
    set_result("ok", tostring(added) .. "\t" .. added_name)
  end
end

local request = reaper.GetExtState(SECTION, "request")
reaper.DeleteExtState(SECTION, "request", false)

if request == "" then
  register()
else
  local verb, target, show, fx_name = request:match("^([^\t]*)\t([^\t]*)\t([^\t]*)\t(.+)$")
  if request == "info" then
    set_result("ok", reaper.GetAppVersion() .. "\t" .. reaper.GetResourcePath())
  elseif verb == "addfx" then
    add_fx(target, show, fx_name)
  else
    set_result("error", "unrecognized request")
  end
end
