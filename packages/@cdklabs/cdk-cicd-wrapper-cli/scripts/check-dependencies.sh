#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0
############################################################
# Check Dependencies                                       #
############################################################
function check_dependencies_mac()
{
  dependencies=$1
  echo -n "Checking dependencies... "
  for name in "${dependencies[@]}";
  do
    [[ $(which $name 2>/dev/null) ]] || { echo -en "\n$name needs to be installed. Use 'brew install $name'";deps=1; }
  done
  [[ $deps -ne 1 ]] && echo "OK" || { echo -en "\nInstall the above and rerun this script\n";exit 1; }
}

function check_dependencies_linux()
{
  dependencies=$1
  echo -n "Checking dependencies... "
  for name in "${dependencies[@]}";
  do
    [[ $(which $name 2>/dev/null) ]] || { echo -en "\n$name needs to be installed. Use 'sudo apt-get install $name'";deps=1; }
  done
  [[ $deps -ne 1 ]] && echo "OK" || { echo -en "\nInstall the above and rerun this script\n";exit 1; }
}

check_dependencies()
{
   ## Check dependencies by OS
   if [ "$(uname)" == "Darwin" ]; then
      check_dependencies_mac "${DEPENDENCIES[*]}"
   elif [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
      check_dependencies_linux "${DEPENDENCIES[*]}"
   else
      echo "Only Mac and Linux OS supported, for verification ..."
   fi

}
