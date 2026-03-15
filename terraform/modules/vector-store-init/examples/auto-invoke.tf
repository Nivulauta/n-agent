# Example: Automatically invoke the vector store init function after deployment
#
# This example shows how to automatically create the OpenSearch index
# as part of your Terraform deployment workflow.
#
# Add this to your main Terraform configuration to enable automatic invocation.

# Option 1: Invoke once after initial deployment
resource "null_resource" "invoke_vector_store_init_once" {
  depends_on = [module.vector_store_init]

  provisioner "local-exec" {
    command = <<EOF
      aws lambda invoke \
        --function-name ${module.vector_store_init.function_name} \
        --payload '{}' \
        --region ${var.aws_region} \
        response.json && \
      cat response.json && \
      rm response.json
    EOF
  }

  # Only run once - tied to the Lambda function ARN
  triggers = {
    lambda_arn = module.vector_store_init.function_arn
  }
}

# Option 2: Invoke on every apply (useful for development)
resource "null_resource" "invoke_vector_store_init_always" {
  depends_on = [module.vector_store_init]

  provisioner "local-exec" {
    command = <<EOF
      aws lambda invoke \
        --function-name ${module.vector_store_init.function_name} \
        --payload '{}' \
        --region ${var.aws_region} \
        response.json && \
      cat response.json && \
      rm response.json
    EOF
  }

  # Run on every apply
  triggers = {
    always_run = timestamp()
  }
}

# Option 3: Invoke with error handling and output
resource "null_resource" "invoke_vector_store_init_with_error_handling" {
  depends_on = [module.vector_store_init]

  provisioner "local-exec" {
    command = <<EOF
      set -e
      echo "Invoking vector store init function..."
      
      aws lambda invoke \
        --function-name ${module.vector_store_init.function_name} \
        --payload '{}' \
        --region ${var.aws_region} \
        --log-type Tail \
        --query 'LogResult' \
        --output text \
        response.json | base64 --decode
      
      echo ""
      echo "Response:"
      cat response.json
      
      # Check for success
      if grep -q '"statusCode":200' response.json; then
        echo "✓ Index initialization successful"
        rm response.json
        exit 0
      else
        echo "✗ Index initialization failed"
        cat response.json
        rm response.json
        exit 1
      fi
    EOF
  }

  triggers = {
    lambda_arn = module.vector_store_init.function_arn
  }
}

# Option 4: Conditional invocation based on variable
variable "auto_invoke_vector_store_init" {
  description = "Whether to automatically invoke the vector store init function"
  type        = bool
  default     = true
}

resource "null_resource" "invoke_vector_store_init_conditional" {
  count = var.auto_invoke_vector_store_init ? 1 : 0

  depends_on = [module.vector_store_init]

  provisioner "local-exec" {
    command = <<EOF
      aws lambda invoke \
        --function-name ${module.vector_store_init.function_name} \
        --payload '{}' \
        --region ${var.aws_region} \
        response.json && \
      cat response.json && \
      rm response.json
    EOF
  }

  triggers = {
    lambda_arn = module.vector_store_init.function_arn
  }
}

# Option 5: Invoke with retry logic
resource "null_resource" "invoke_vector_store_init_with_retry" {
  depends_on = [module.vector_store_init]

  provisioner "local-exec" {
    command = <<EOF
      set -e
      
      MAX_RETRIES=3
      RETRY_DELAY=5
      
      for i in $(seq 1 $MAX_RETRIES); do
        echo "Attempt $i of $MAX_RETRIES..."
        
        if aws lambda invoke \
          --function-name ${module.vector_store_init.function_name} \
          --payload '{}' \
          --region ${var.aws_region} \
          response.json; then
          
          if grep -q '"statusCode":200' response.json; then
            echo "✓ Success!"
            cat response.json
            rm response.json
            exit 0
          fi
        fi
        
        if [ $i -lt $MAX_RETRIES ]; then
          echo "Failed, retrying in $RETRY_DELAY seconds..."
          sleep $RETRY_DELAY
        fi
      done
      
      echo "✗ Failed after $MAX_RETRIES attempts"
      cat response.json
      rm response.json
      exit 1
    EOF
  }

  triggers = {
    lambda_arn = module.vector_store_init.function_arn
  }
}

# Output the invocation result
output "vector_store_init_invoked" {
  description = "Whether the vector store init function was invoked"
  value       = var.auto_invoke_vector_store_init
}

variable "aws_region" {
  description = "AWS region for Lambda invocation"
  type        = string
}