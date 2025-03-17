#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0
################################################################################
#### Configuration Section
################################################################################

CURRENT_PATH=`pwd`;
SCRIPT=$(readlink -f $0);
SCRIPTPATH=`dirname $SCRIPT`;
# NPM always runs in the root of the project, so we just need to check if there's a package.json
if [ -f 'package.json' ]; then
    PROJECT_ROOT="$CURRENT_PATH";
else
    PROJECT_ROOT="${SCRIPTPATH}/..";
fi

# TEMPLATE
PACKAGE_JSON_TEMPLATE="$PROJECT_ROOT/package.json"
echo "${PACKAGE_JSON_TEMPLATE}"
if [ -f "$PROJECT_ROOT/templates/package.json.template" ]
then
   PACKAGE_JSON_TEMPLATE="$PROJECT_ROOT/templates/package.json.template"
fi
PACKAGE_JSON_DEST="$PROJECT_ROOT/package.json"

CDK_JSON_TEMPLATE="$PROJECT_ROOT/cdk.json"
if [ -f "$PROJECT_ROOT/templates/cdk.json.template" ]
then
   CDK_JSON_TEMPLATE="$PROJECT_ROOT/templates/cdk.json.template"
fi
CDK_JSON_DEST="$PROJECT_ROOT/cdk.json"

QUESTIONARY=(
    "Which AWS region would you like to use?;AWS region for deploying the CodePipeline and application stacks.;region;AWS_REGION"
    "What is the RES AWS account number?;AWS account number for RES environment.;RES account;ACCOUNT_RES"
    "What is your AWS cli profile for RES environment?;AWS profile name for RES environment.;RES profile;RES_ACCOUNT_AWS_PROFILE"
    "What is the DEV AWS account number?;AWS account number or - (dash) in case the DEV environment is not needed.;DEV account;ACCOUNT_DEV"
    "What is your AWS cli profile for DEV environment?;AWS profile name or - (dash) in case the DEV environment is not needed.;DEV profile;DEV_ACCOUNT_AWS_PROFILE"
    "What is the INT AWS account number?;AWS account number or - (dash) in case the INT environment is not needed.;INT account;ACCOUNT_INT"
    "What is your AWS cli profile for INT environment?;AWS profile name or - (dash) in case the INT environment is not needed.;INT profile;INT_ACCOUNT_AWS_PROFILE"
    "What is your Proxy configuration?;Proxy configuration. Leave empty if you do not need proxy.;Proxy secret arn;PROXY_SECRET_ARN"
)

DEFAULT_CDK_QALIFIER="hnb659fds";

DEPENDENCIES=(jq)
################################################################################
#### END Configuration Section
################################################################################

ME=$(basename "$0")
DATETIME=$(date "+%Y-%m-%d-%H-%M-%S")

if [[ ! $LC_CTYPE ]]; then
	export LC_CTYPE='en_US.UTF-8'
fi
if [[ ! $LC_ALL ]]; then
	export LC_ALL='en_US.UTF-8'
fi

################################################################################
# Usage
################################################################################

function usage {
	returnCode="$1"
    echo -e "\nVanilla Configuration Tool to scaffold and/or initialize local environment!"
    echo -e "\n"
	echo -e "Usage: $ME [-h][-d]:
	[-h]\t\t displays help (this message)
    [-d]\t\t activates debug invormation"
	exit "$returnCode"
}

############################################################
# Import dependencies                                      #
############################################################
source "$SCRIPTPATH/check-dependencies.sh"

################################################################################
# Terminal output helpers
################################################################################

# echo_equals() outputs a line with =
#   seq does not exist under OpenBSD
function echo_equals() {
	COUNTER=0
	while [  $COUNTER -lt "$1" ]; do
		printf '='
		(( COUNTER=COUNTER+1 ))
	done
}

# echo_title() outputs a title padded by =, in yellow.
function echo_title() {
	TITLE=$1
	NCOLS=$(tput cols)
	NEQUALS=$(((NCOLS-${#TITLE})/2-1))
	tput setaf 3 0 0 # 3 = yellow
	echo_equals "$NEQUALS"
	printf " %s " "$TITLE"
	echo_equals "$NEQUALS"
	tput sgr0  # reset terminal
	echo
}

# echo_step() outputs a step collored in cyan, without outputing a newline.
function echo_step() {
	tput setaf 6 0 0 # 6 = cyan
	echo -n "$1"
	tput sgr0  # reset terminal
}

# echo_step_info() outputs additional step info in cyan, without a newline.
function echo_step_info() {
	tput setaf 6 0 0 # 6 = cyan
	echo -n " ($1)"
	tput sgr0  # reset terminal
}

# echo_right() outputs a string at the rightmost side of the screen.
function echo_right() {
	TEXT=$1
	echo
	tput cuu1
	tput cuf "$(tput cols)"
	tput cub ${#TEXT}
	echo "$TEXT"
}

# echo_failure() outputs [ FAILED ] in red, at the rightmost side of the screen.
function echo_failure() {
	tput setaf 1 0 0 # 1 = red
	echo_right "[ FAILED ]"
	tput sgr0  # reset terminal
}

# echo_success() outputs [ OK ] in green, at the rightmost side of the screen.
function echo_success() {
	tput setaf 2 0 0 # 2 = green
	echo_right "[ OK ]"
	tput sgr0  # reset terminal
}

# echo_warning() outputs a message and [ WARNING ] in yellow, at the rightmost side of the screen.
function echo_warning() {
	tput setaf 3 0 0 # 3 = yellow
	echo_right "[ WARNING ]"
	tput sgr0  # reset terminal
	echo "    ($1)"
}

# exit_with_message() outputs and logs a message before exiting the script.
function exit_with_message() {
	echo
	echo "$1"
	echo
	debug_variables
	echo
	exit 1
}

# exit_with_failure() calls echo_failure() and exit_with_message().
function exit_with_failure() {
	echo_failure
	exit_with_message "FAILURE: $1" 1
}

# command_exists() tells if a given command exists.
function command_exists() {
	command -v "$1" >/dev/null 2>&1
}

# read_input to read inputs from the user and store it in variable
function read_input() {
    echo_title "$1"
    echo "$2"

    local __resultvar=$4
    
    read -p "$3: " inputvar 

    eval $__resultvar="$inputvar"
}

function read_input_boolean() {
    echo $1
    while true; do
        read_input "$1" "$2" "(Y)es or (N)o?" "$3"
        eval yn="\$$3"
        case $yn in
            [Yy]* ) break;;
            [Nn]* ) break;;
            * ) echo "Please answer yes or no.";;
        esac
    done
}

# debug_variables() print all script global variables to ease debugging
debug_variables() {
	echo "USERNAME: $USERNAME"
	echo "SHELL: $SHELL"
	echo "BASH_VERSION: $BASH_VERSION"
	echo 
    echo "Questionary/Parsing Results:"
    echo "======================================"
    echo -e "\tIS_SCAFFOLDING: $IS_SCAFFOLDING"
    echo -e "\tAPPLICATION_NAME: $APPLICATION_NAME"
    echo -e "\t\tREPOSITORY_TYPE: $REPOSITORY_TYPE"
    echo -e "\t\tIS_GITHUB: $IS_GITHUB"
    echo -e "\t\t\tIS_ARN_READY: $IS_ARN_READY"
    echo -e "\t\t\tCODESTAR_CONNECTION_ARN: $CODESTAR_CONNECTION_ARN"
    echo -e "\tGIT_REPOSITORY: $GIT_REPOSITORY"
    echo -e "\tCDK_QUALIFIER: $CDK_QUALIFIER"

    for question in "${QUESTIONARY[@]}"
    do
        IFS=";" read -r -a arr <<< "${question}"

        local ___value=

        eval ___value="\$${arr[3]}"

        echo -e "\t${arr[3]}: ${___value}"
    done
}

############################################################
# Collect Inputs                                           #
############################################################

function collect_inputs() {
    echo_step "Collecting Information..."
    echo

    read_input_boolean "Creating a new CDK CI/CD Wrapper?" "Do you want to create a new CDK CI/CD Wrapper project?" IS_SCAFFOLDING
 project
    if [[ $IS_SCAFFOLDING =~ [Yy]+ ]]; then
        collect_inputs_for_scaffolding
    else
        read_up_data
    fi

    # Rest of the questioner
    for question in "${QUESTIONARY[@]}"
    do
        IFS=";" read -r -a arr <<< "${question}"

        read_input "${arr[0]}" "${arr[1]}" "${arr[2]}" "${arr[3]}"
    done

    echo_success
    echo
}

function collect_inputs_for_scaffolding() {
    read_input "What should the name of the project be?" "This name will be set as your application and NPM package name." "application name" APPLICATION_NAME

    read_input_boolean "Using GitHub?" "Do you want to use GitHub?" IS_GITHUB

    if [[ $IS_GITHUB =~ [Yy]+ ]]; then
        collect_inputs_for_github
    else
        collect_input_for_codecommit
    fi

    read_input "What is your desired CDK Qualifier?" \
        "CDK Qualifier should be unique for the accounts in the region. You can read more about cdk qualifiers (https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html). Length must be less than 9 characters. If you want to use the default bootstrapping use the '${DEFAULT_CDK_QALIFIER}' value." \
        "cdk qualifier" \
        CDK_QUALIFIER

    read_input_boolean "Would you like to use a VPC?" "Do you want your project to run the pipeline within a VPC?" ENABLE_VPC

    if [[ $ENABLE_VPC =~ [Yy]+ ]]; then
        read_input_boolean "New or existing VPC?" "Do you want to create a new VPC? (type 'No' to re-use an existing VPC)" CREATE_VPC

        if [[ $CREATE_VPC =~ [Yy]+ ]]; then
            CICD_VPC_TYPE="VPC"
        else
            read_input "Reusing an existing VPC" \
                "Type your VPC ID. You can find it in the VPC section of the AWS console." \
                "vpc-id" \
                VPC_ID
            CICD_VPC_TYPE="VPC_FROM_LOOK_UP"
        fi
    else
        CICD_VPC_TYPE="NO_VPC"
    fi
}

function collect_inputs_for_github() {
    REPOSITORY_TYPE="GITHUB";

    read_input_boolean "Do you know the AWS CodeStar Connection Arn?" \
        "AWS CodeStar Connection has to be established before the pipeline is deployed to the RES account." IS_ARN_READY

    if [[ $IS_ARN_READY =~ [Yy]+ ]]; then
        read_input "What is the AWS CodeStar Connection Arn?" \
            "Please provide the AWS CodeStar Connection. It's format is arn:aws:codestar-connections:<region>:<account>:connection/<unique_id>" \
            "CodeStar Connection Arn" CODESTAR_CONNECTION_ARN
        read_input "What is the GitHub Repository name?" \
            "The GitHub repository name is in 'owner/name' format. Please provide in this format." \
            "Owner/Name" GIT_REPOSITORY
    else
        echo_warning "Please check the documentation of the CDK-CICD-Wrapper pipeline. '${SCRIPTPATH}/../docs/prerequisites-github-codestarconnection.md'"
        exit 1
    fi
}

function collect_input_for_codecommit() {
    REPOSITORY_TYPE="CODECOMMIT";

    read_input "What the CodeCommit Repository name should be?" \
        "This value is used to create your CodeCommit repository. This needs to be uniqe in the account." \
        "Repository Name" GIT_REPOSITORY
}

function read_up_data() {
    echo_step "Discovering project settings..."
    echo

    REPOSITORY_TYPE=$(jq -r ".config.repositoryType" "$PROJECT_ROOT/package.json")
    echo_step_info "Founded Git repository type: ${REPOSITORY_TYPE}"
    echo

    CDK_QUALIFIER=$(jq -r ".config.cdkQualifier" "$PROJECT_ROOT/package.json")
    echo_step_info "Founded CDK Qualifier: ${CDK_QUALIFIER}"
    echo

    echo_success "Finished discovery..."
    echo

    if [[ $REPOSITORY_TYPE == "GITHUB" ]]; then
        IS_GITHUB="y"

        collect_inputs_for_github
    fi
}

############################################################
# Update package.json vars                                 #
############################################################
update_package()
{
    echo_step "Updating package.json..."
    echo
    jq """.config.applicationName = \"${APPLICATION_NAME}\" 
        | .config.cdkQualifier = \"${CDK_QUALIFIER}\" 
        | .config.repositoryType = \"${REPOSITORY_TYPE}\" 
        | .config.repositoryName = \"${GIT_REPOSITORY}\"
        | .config.cicdVpcType = \"${CICD_VPC_TYPE}\"
        $(if [[ ! -z $VPC_ID ]]; then echo " | .config.cicdVpcId = \"${VPC_ID}\""; fi)
        """ "$PACKAGE_JSON_TEMPLATE" > "$PACKAGE_JSON_DEST.tmp" && mv "$PACKAGE_JSON_DEST.tmp" "$PACKAGE_JSON_DEST"
    echo_success "Finished the update of package.json"
    echo
}

############################################################
# Update cdk.json vars                                     #
############################################################
update_CDK()
{
    echo_step "Updating cdk.json..."
    echo
    if [[ "$DEFAULT_CDK_QALIFIER" == "${CDK_QUALIFIER}" ]]; then
        jq ".context.\"@aws-cdk/core:bootstrapQualifier\" = \"${CDK_QUALIFIER}\"" "$CDK_JSON_TEMPLATE" > "$CDK_JSON_DEST.tmp" && mv "$CDK_JSON_DEST.tmp" "$CDK_JSON_DEST"
    else
        jq ".context.\"@aws-cdk/core:bootstrapQualifier\" = \"${CDK_QUALIFIER}\" | .toolkitStackName = \"CDKToolkit-${CDK_QUALIFIER}\"" "$CDK_JSON_TEMPLATE" > "$CDK_JSON_DEST.tmp" && mv "$CDK_JSON_DEST.tmp" "$CDK_JSON_DEST"
    fi
    echo_success "Finished the update of cdk.json"
    echo
}

############################################################
# Generate .env                                  #
############################################################
generate_environment_file()
{
   echo_step "Generating environment file..."
   echo
   env_file="$PROJECT_ROOT/.env"
   
   echo "# Environment file generated by $ME." >> "$env_file"

   if [[ $IS_GITHUB =~ [Yy]+ ]]; then
        echo "CODESTAR_CONNECTION_ARN=${CODESTAR_CONNECTION_ARN}" >> "$env_file"
   fi

    for question in "${QUESTIONARY[@]}"
    do
        IFS=";" read -r -a arr <<< "${question}"

        local ___value=

        eval ___value="\$${arr[3]}"

        echo "${arr[3]}=${___value}" >> "$env_file"
    done

    echo "AWS_PROFILE=\${RES_ACCOUNT_AWS_PROFILE}" >> "$env_file"

    echo_success

    echo_step_info "To use the newly created '$env_file'."
    echo
}

################################################################################
# MAIN
################################################################################

while getopts "hd" opt; do
    case $opt in
    h)
        usage 0
        ;;
    d)
        debug=true
        ;;
    *)
        echo "Invalid option: -$OPTARG"
        usage 1
        ;;
    esac
done

check_dependencies
collect_inputs

if [[ $IS_SCAFFOLDING =~ [Yy]+ ]]; then
    update_package
    update_CDK
fi

generate_environment_file

if [ ! -z "$debug" ]; then
    debug_variables
fi
