#!/usr/bin/env ruby
# Adds PhotoCleanupPlugin.swift and PhotoCleanupPlugin.m to the Xcode
# project's App target so the compiler picks them up without manual edits.
#
# The .m file contains the CAP_PLUGIN macro that registers the plugin with
# the Capacitor ObjC bridge under the JS name "PhotoCleanup".  Without it
# the bridge cannot dispatch processPhoto() calls to the Swift class.
require 'xcodeproj'

def find_group_with_file(group, filename)
  return group if group.files.any? { |f| f.path == filename }
  group.groups.each do |g|
    result = find_group_with_file(g, filename)
    return result if result
  end
  nil
end

project = Xcodeproj::Project.open('artifacts/outfit-generator/ios/App/App.xcodeproj')
target  = project.targets.find { |t| t.name == 'App' }
raise "No 'App' target found" unless target

app_group  = find_group_with_file(project.main_group, 'AppDelegate.swift')
app_group ||= project.main_group.find_subpath('App', false)
raise "Could not find App source group" unless app_group

puts "Using group: #{app_group.path}"

['PhotoCleanupPlugin.swift', 'PhotoCleanupPlugin.m'].each do |fname|
  in_build = target.source_build_phase.files.any? { |bf| bf.file_ref&.path == fname }
  if in_build
    puts "  #{fname} already in build phase"
  else
    existing = app_group.files.find { |f| f.path == fname }
    ref = existing || app_group.new_reference(fname)
    target.source_build_phase.add_file_reference(ref)
    puts "  #{fname} added ✓"
  end
end

project.save
puts 'xcodeproj saved ✓'
