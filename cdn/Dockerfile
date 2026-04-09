FROM nginx:alpine

# Copy embed files into nginx html folder
COPY embed.js /usr/share/nginx/html/embed.js

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
