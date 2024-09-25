FROM python:3.12-slim

# Set the working directory
WORKDIR /app

# Install pipenv to manage dependencies
RUN pip install pipenv

# Copy the Pipfile and Pipfile.lock first to leverage Docker cache
COPY Pipfile Pipfile.lock ./

# Install project dependencies from Pipfile
RUN pipenv install --system --deploy --ignore-pipfile

# Copy the rest of the application code
COPY . .

# Expose the port on which Streamlit runs
EXPOSE 8501

# Command to run Streamlit app
CMD ["streamlit", "run", "image_prompts_app.py", "--server.port", "8501", "--server.address", "0.0.0.0"]