FROM pulumi/pulumi-python:latest

WORKDIR /infra

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

ENTRYPOINT ["/infra/entrypoint.sh"]
CMD ["preview"]
